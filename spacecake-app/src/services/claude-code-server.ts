import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import * as Schema from "effect/Schema"
import { BrowserWindow, ipcMain } from "electron"
import { WebSocket, WebSocketServer } from "ws"

import type { DisplayStatusline } from "@/lib/statusline-parser"
import { ClaudeConfig } from "@/services/claude-config"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { FileSystem } from "@/services/file-system"
import type { ClaudeCodeStatus, OpenFilePayload } from "@/types/claude-code"
import {
  AtMentionedPayloadSchema,
  OpenFileArgsSchema,
  SelectionChangedPayloadSchema,
} from "@/types/claude-code"
import { JsonRpcMessageSchema, ToolCallParamsSchema, type JsonRpcResponse } from "@/types/rpc"
import { AbsolutePath } from "@/types/workspace"

function broadcastClaudeCodeStatus(status: ClaudeCodeStatus) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("claude-code-status", status)
  })
}

function broadcastOpenFile(payload: OpenFilePayload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("claude:open-file", payload)
  })
}

function broadcastStatusline(statusline: DisplayStatusline) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("statusline-update", statusline)
  })
}

function broadcastStatuslineCleared(surfaceId?: string) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("statusline-cleared", surfaceId)
  })
}

// MCP tool definitions for tools/list response
const OPEN_FILE_TOOL = {
  name: "openFile",
  description: "Open a file in the editor and optionally select a range of text",
  inputSchema: {
    type: "object" as const,
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to open",
      },
      preview: {
        type: "boolean",
        description: "Whether to open in preview mode",
        default: false,
      },
      startText: {
        type: "string",
        description: "Text pattern to find selection start",
      },
      endText: {
        type: "string",
        description: "Text pattern to find selection end",
      },
      selectToEndOfLine: {
        type: "boolean",
        description: "Extend selection to end of line",
        default: false,
      },
      makeFrontmost: {
        type: "boolean",
        description: "Make the file the active editor tab",
        default: true,
      },
    },
    required: ["filePath"],
  },
}

export interface ClaudeCodeServerService {
  readonly ensureStarted: (workspaceFolders: string[]) => Promise<void>
  readonly broadcast: (method: string, params: unknown) => void
  readonly isStarted: () => boolean
}

const PORT_RANGE_START = 10000
const PORT_RANGE_END = 65535

function getRandomPort(): number {
  return Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START + 1)) + PORT_RANGE_START
}

/**
 * Remove lock files whose owning process is no longer alive.
 * This handles cases where the process was killed (SIGKILL) or crashed
 * before the Effect finalizer could run.
 */
const cleanStaleLockFiles = (ideDir: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const entries = yield* Effect.try(() => fs.readdirSync(ideDir))

    yield* Effect.forEach(
      entries.filter((name) => name.endsWith(".lock")),
      (entry) =>
        Effect.gen(function* () {
          const lockPath = path.join(ideDir, entry)
          const raw = yield* Effect.try(() => fs.readFileSync(lockPath, "utf-8"))
          const data = yield* Effect.try(
            () => JSON.parse(raw) as { ideName?: string; pid?: number },
          )

          // only clean up spacecake lock files — other IDEs manage their own
          if (data.ideName !== "spacecake") return
          if (typeof data.pid !== "number") return

          // process.kill(pid, 0) throws if the process doesn't exist
          const isAlive = yield* Effect.try(() => {
            process.kill(data.pid!, 0)
            return true
          }).pipe(Effect.orElseSucceed(() => false))

          if (!isAlive) {
            yield* Effect.try(() => fs.unlinkSync(lockPath))
          }
        }).pipe(Effect.catchAll(() => Effect.void)),
      { discard: true },
    )
  }).pipe(Effect.catchAll(() => Effect.void))

export const makeClaudeCodeServer = Effect.gen(function* () {
  const claudeConfig = yield* ClaudeConfig
  const fsService = yield* FileSystem
  const hooksServer = yield* ClaudeHooksServer

  // Lazy state - server is not started until ensureStarted() is called
  let serverState: {
    wss: WebSocketServer
    port: number
    lockFilePath: AbsolutePath
    authToken: string
    workspaceFolders: string[]
  } | null = null

  let startPromise: Promise<void> | null = null
  let statuslineCleanup: (() => void)[] = []
  let exitListener: (() => void) | null = null
  let activeWss: WebSocketServer | null = null

  const startServerEffect = Effect.gen(function* () {
    const port = getRandomPort()
    const wss = yield* Effect.async<WebSocketServer, Error>((resume) => {
      const server = new WebSocketServer({ port })

      const onListening = () => {
        server.removeListener("error", onError)
        resume(Effect.succeed(server))
      }

      const onError = (err: Error) => {
        server.removeListener("listening", onListening)
        resume(Effect.fail(err))
      }

      server.once("listening", onListening)
      server.once("error", onError)
      return Effect.sync(() => {
        server.close()
      })
    })
    return { wss, port }
  }).pipe(
    Effect.retry({
      times: 10,
      while: (err: Error & { code?: string }) => err.code === "EADDRINUSE",
    }),
  )

  const doStartEffect = (workspaceFolders: string[]) =>
    Effect.gen(function* () {
      const { wss, port } = yield* startServerEffect
      activeWss = wss
      const authToken = crypto.randomUUID()

      // parallelize independent startup: hooks server vs ide dir preparation
      yield* Effect.all(
        [
          Effect.promise(() => hooksServer.ensureStarted()),
          fsService
            .createFolder(claudeConfig.ideDir, { recursive: true })
            .pipe(Effect.andThen(() => cleanStaleLockFiles(claudeConfig.ideDir))),
        ],
        { concurrency: "unbounded" },
      )

      // register statusline callbacks to broadcast to renderer
      statuslineCleanup.forEach((fn) => fn())
      statuslineCleanup = [
        hooksServer.onStatuslineUpdate((statusline) => {
          broadcastStatusline(statusline)
        }),
        hooksServer.onStatuslineCleared((surfaceId) => {
          broadcastStatuslineCleared(surfaceId)
        }),
      ]
      const lockFilePath = AbsolutePath(path.join(claudeConfig.ideDir, `${port}.lock`))

      wss.on("connection", (ws, req) => {
        const authHeader = req.headers["x-claude-code-ide-authorization"]
        if (authHeader !== authToken) {
          console.warn("Claude Code Server: Unauthorized connection attempt")
          ws.close(1008, "Unauthorized")
          return
        }

        ws.on("close", () => {
          broadcastClaudeCodeStatus("disconnected")
        })

        ws.on("message", (message) => {
          let parsed: unknown
          try {
            parsed = JSON.parse(message.toString())
          } catch (err) {
            console.error("claude code server: failed to parse json", err)
            return
          }

          const decoded = Schema.decodeUnknownEither(JsonRpcMessageSchema)(parsed)
          if (Either.isLeft(decoded)) {
            console.error("claude code server: invalid json-rpc message", decoded.left)
            return
          }

          const data = decoded.right
          // Handle initialize request - broadcast "connecting" status
          if (data.method === "initialize" && data.id !== null && data.id !== undefined) {
            broadcastClaudeCodeStatus("connecting")
            const initResponse = {
              jsonrpc: "2.0",
              id: data.id,
              result: {
                protocolVersion: "2025-11-25",
                capabilities: {
                  tools: {
                    listChanged: true,
                  },
                },
                serverInfo: { name: "spacecake", version: "1.0" },
              },
            } satisfies JsonRpcResponse
            ws.send(JSON.stringify(initResponse))
            return
          }

          // Track when Claude Code IDE is fully connected
          if (data.method === "ide_connected") {
            const params = data.params as { pid?: number } | undefined
            if (params?.pid) {
              hooksServer.setPendingPid(params.pid)
            }
            broadcastClaudeCodeStatus("connected")
            return
          }

          // Handle tools/list request - respond with available tools
          if (data.method === "tools/list" && data.id !== null && data.id !== undefined) {
            const toolsListResponse = {
              jsonrpc: "2.0",
              id: data.id,
              result: {
                tools: [OPEN_FILE_TOOL],
              },
            } satisfies JsonRpcResponse
            ws.send(JSON.stringify(toolsListResponse))
            return
          }

          // Handle tools/call request
          if (data.method === "tools/call" && data.id !== null && data.id !== undefined) {
            const paramsDecoded = Schema.decodeUnknownEither(ToolCallParamsSchema)(data.params)
            if (Either.isLeft(paramsDecoded)) {
              console.error("claude code server: invalid tools/call params", paramsDecoded.left)
              const errorResponse = {
                jsonrpc: "2.0",
                id: data.id,
                result: {
                  content: [{ type: "text", text: "Error: Invalid tool call params" }],
                  isError: true,
                },
              } satisfies JsonRpcResponse
              ws.send(JSON.stringify(errorResponse))
              return
            }

            const toolParams = paramsDecoded.right

            if (toolParams.name === "openFile") {
              const argsDecoded = Schema.decodeUnknownEither(OpenFileArgsSchema)(
                toolParams.arguments,
              )
              if (Either.isLeft(argsDecoded)) {
                console.error("claude code server: invalid openFile args", argsDecoded.left)
                const errorResponse = {
                  jsonrpc: "2.0",
                  id: data.id,
                  result: {
                    content: [{ type: "text", text: "Error: Invalid openFile arguments" }],
                    isError: true,
                  },
                } satisfies JsonRpcResponse
                ws.send(JSON.stringify(errorResponse))
                return
              }

              const args = argsDecoded.right

              // Find which workspace contains this file
              const matchingWorkspace = workspaceFolders.find((folder) =>
                args.filePath.startsWith(folder),
              )

              if (!matchingWorkspace) {
                console.warn("claude code server: file not in any workspace", args.filePath)
                const errorResponse = {
                  jsonrpc: "2.0",
                  id: data.id,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: `Error: File ${args.filePath} is not in any open workspace`,
                      },
                    ],
                    isError: true,
                  },
                } satisfies JsonRpcResponse
                ws.send(JSON.stringify(errorResponse))
                return
              }

              // Broadcast to renderer to open the file
              broadcastOpenFile({
                workspacePath: matchingWorkspace,
                filePath: args.filePath,
                source: "claude",
              })

              // Send success response
              const successResponse = {
                jsonrpc: "2.0",
                id: data.id,
                result: {
                  content: [{ type: "text", text: `Opened file: ${args.filePath}` }],
                },
              } satisfies JsonRpcResponse
              ws.send(JSON.stringify(successResponse))
              return
            }

            // Unknown tool
            const unknownToolResponse = {
              jsonrpc: "2.0",
              id: data.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Error: Unknown tool: ${toolParams.name}`,
                  },
                ],
                isError: true,
              },
            } satisfies JsonRpcResponse
            ws.send(JSON.stringify(unknownToolResponse))
            return
          }

          // Handle resources/list request - return empty resources (safety net)
          if (data.method === "resources/list" && data.id !== null && data.id !== undefined) {
            const resourcesListResponse = {
              jsonrpc: "2.0",
              id: data.id,
              result: {
                resources: [],
              },
            } satisfies JsonRpcResponse
            ws.send(JSON.stringify(resourcesListResponse))
            return
          }

          // Catch-all: respond with Method not found for any unhandled request expecting a response
          if (data.id !== null && data.id !== undefined) {
            const errorResponse = {
              jsonrpc: "2.0",
              id: data.id,
              error: {
                code: -32601,
                message: `Method not found: ${data.method}`,
              },
            }
            ws.send(JSON.stringify(errorResponse))
            return
          }
        })
      })

      const lockData = {
        pid: process.pid,
        workspaceFolders,
        ideName: "spacecake",
        transport: "ws",
        authToken: authToken,
      }

      yield* fsService.writeTextFile(lockFilePath, JSON.stringify(lockData)).pipe(
        Effect.tap(() =>
          Effect.log(`claude code server listening on port ${port}, lock file: ${lockFilePath}`),
        ),
        Effect.catchAll(() => Effect.logError("failed to write lock file")),
      )

      // synchronous safety net: delete lock file on process exit.
      // the "exit" event fires for normal exits and SIGTERM (but not SIGKILL).
      // this catches cases where the async Effect finalizer doesn't get a chance to run
      // (e.g. e2e test teardown, ctrl+C during dev).
      exitListener = () => {
        try {
          fs.unlinkSync(lockFilePath)
        } catch {
          // already deleted or inaccessible, ignore
        }
      }
      process.once("exit", exitListener)

      // Store state for cleanup and broadcast
      serverState = { wss, port, lockFilePath, authToken, workspaceFolders }

      process.env.CLAUDE_CODE_SSE_PORT = port.toString()
      process.env.ENABLE_IDE_INTEGRATION = "true"
    })

  const ensureStarted = async (workspaceFolders: string[]): Promise<void> => {
    if (serverState) return // Already started
    if (startPromise) return startPromise // Currently starting

    startPromise = Effect.runPromise(doStartEffect(workspaceFolders)).catch((err) => {
      // If server fails to start, reset to disconnected state
      broadcastClaudeCodeStatus("disconnected")
      startPromise = null // Allow retry
      throw err
    })
    await startPromise
  }

  const broadcast = (method: string, params: unknown) => {
    if (!serverState) return // Server not started, no-op

    const message = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    })
    serverState.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  const isStarted = () => serverState !== null

  // Register IPC handlers - these work whether server is started or not
  // They just no-op if server isn't running
  ipcMain.handle("claude:ensure-server", async (_, workspaceFolders: string[]) => {
    await ensureStarted(workspaceFolders)
  })

  ipcMain.handle("claude:selection-changed", (_, payload) => {
    if (!serverState) return
    const decoded = Schema.decodeUnknownEither(SelectionChangedPayloadSchema)(payload)
    if (Either.isLeft(decoded)) {
      console.error("claude code server: invalid selection changed payload", decoded.left)
      return
    }
    broadcast("selection_changed", decoded.right)
  })

  ipcMain.handle("statusline:clear-surface", (_, surfaceId: string) => {
    hooksServer.clearSurface(surfaceId)
  })

  ipcMain.handle("claude:check-surface-alive", (_, surfaceId: string) => {
    if (!hooksServer.isSurfaceAlive(surfaceId)) {
      hooksServer.clearSurface(surfaceId)
    }
  })

  ipcMain.handle("claude:at-mentioned", (_, payload) => {
    if (!serverState) return
    const decoded = Schema.decodeUnknownEither(AtMentionedPayloadSchema)(payload)
    if (Either.isLeft(decoded)) {
      console.error("claude code server: invalid at-mentioned payload", decoded.left)
      return
    }
    broadcast("at_mentioned", decoded.right)
  })

  // Finalizer cleans up server and lock file. Uses activeWss as a fallback
  // in case the scope closes while doStartEffect is still in progress
  // (after the WebSocket server is listening but before serverState is set).
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (!serverState && !activeWss) {
        return
      }

      yield* Effect.log("claude code server: stopping...")
      if (exitListener) {
        process.removeListener("exit", exitListener)
        exitListener = null
      }
      statuslineCleanup.forEach((fn) => fn())
      statuslineCleanup = []
      broadcastClaudeCodeStatus("disconnected")
      // terminate all connected clients so wss.close() can complete
      const wss = activeWss ?? serverState?.wss
      if (wss) {
        for (const client of wss.clients) {
          client.terminate()
        }
        yield* Effect.async<void, never>((resume) => {
          wss.close(() => resume(Effect.void))
        })
        activeWss = null
      }

      if (serverState) {
        const exists = yield* fsService.exists(serverState.lockFilePath)
        if (exists) {
          yield* fsService.remove(serverState.lockFilePath)
        }
      }
    }).pipe(Effect.catchAll(() => Effect.void)),
  )

  return {
    ensureStarted,
    broadcast,
    isStarted,
  } as const
})

export class ClaudeCodeServer extends Effect.Service<ClaudeCodeServer>()("ClaudeCodeServer", {
  scoped: makeClaudeCodeServer,
  dependencies: [ClaudeConfig.Default, ClaudeHooksServer.Default, FileSystem.Default],
}) {}
