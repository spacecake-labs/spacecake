import { Effect, Either, Schema } from "effect"
import { BrowserWindow, ipcMain } from "electron"
import crypto from "node:crypto"
import path from "node:path"
import { WebSocket, WebSocketServer } from "ws"

import type { DisplayStatusline } from "@/lib/statusline-parser"
import type { ClaudeCodeStatus, OpenFilePayload } from "@/types/claude-code"

import { ClaudeConfig } from "@/services/claude-config"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { FileSystem } from "@/services/file-system"
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
    })
    return { wss, port }
  }).pipe(
    Effect.retry({
      times: 10,
      while: (err: Error & { code?: string }) => err.code === "EADDRINUSE",
    }),
  )

  const doStart = async (workspaceFolders: string[]): Promise<void> => {
    const { wss, port } = await Effect.runPromise(startServerEffect)
    const authToken = crypto.randomUUID()

    // Start the statusline server alongside Claude Code server
    // (both are related to Claude Code sessions)
    await hooksServer.ensureStarted()

    // Register statusline update callback to broadcast to renderer
    hooksServer.onStatuslineUpdate((statusline) => {
      broadcastStatusline(statusline)
    })

    await Effect.runPromise(fsService.createFolder(claudeConfig.ideDir, { recursive: true }))
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
                resources: {},
              },
              serverInfo: { name: "spacecake", version: "1.0" },
            },
          } satisfies JsonRpcResponse
          ws.send(JSON.stringify(initResponse))
          return
        }

        // Track when Claude Code IDE is fully connected
        if (data.method === "ide_connected") {
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
            const argsDecoded = Schema.decodeUnknownEither(OpenFileArgsSchema)(toolParams.arguments)
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
      })
    })

    const lockData = {
      pid: process.pid,
      workspaceFolders,
      ideName: "spacecake",
      transport: "ws",
      authToken: authToken,
    }

    try {
      await Effect.runPromise(fsService.writeTextFile(lockFilePath, JSON.stringify(lockData)))
      console.log(`Claude Code Server listening on port ${port}, lock file: ${lockFilePath}`)
    } catch (error) {
      console.error("Failed to write lock file", error)
    }

    // Store state for cleanup and broadcast
    serverState = { wss, port, lockFilePath, authToken, workspaceFolders }

    process.env.CLAUDE_CODE_SSE_PORT = port.toString()
    process.env.ENABLE_IDE_INTEGRATION = "true"
  }

  const ensureStarted = async (workspaceFolders: string[]): Promise<void> => {
    if (serverState) return // Already started
    if (startPromise) return startPromise // Currently starting

    startPromise = doStart(workspaceFolders).catch((err) => {
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

  ipcMain.handle("claude:at-mentioned", (_, payload) => {
    if (!serverState) return
    const decoded = Schema.decodeUnknownEither(AtMentionedPayloadSchema)(payload)
    if (Either.isLeft(decoded)) {
      console.error("claude code server: invalid at-mentioned payload", decoded.left)
      return
    }
    broadcast("at_mentioned", decoded.right)
  })

  // Finalizer only cleans up if server was actually started
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (!serverState) {
        return
      }

      console.log("Claude Code Server: Stopping...")
      broadcastClaudeCodeStatus("disconnected")
      // Terminate all connected clients so wss.close() can complete
      for (const client of serverState.wss.clients) {
        client.terminate()
      }
      yield* Effect.async<void, never>((resume) => {
        serverState!.wss.close(() => resume(Effect.void))
      })

      const exists = yield* fsService.exists(serverState.lockFilePath)
      if (exists) {
        yield* fsService.remove(serverState.lockFilePath)
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
