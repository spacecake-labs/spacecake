import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"

import { FileSystem } from "@/services/file-system"
import { Console, Effect } from "effect"
import { BrowserWindow, ipcMain } from "electron"
import { WebSocket, WebSocketServer } from "ws"

import type { ClaudeCodeStatus } from "@/types/claude-code"
import { AbsolutePath } from "@/types/workspace"

function broadcastClaudeCodeStatus(status: ClaudeCodeStatus) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("claude-code-status", status)
  })
}

export interface ClaudeCodeServerService {
  readonly broadcast: (method: string, params: unknown) => void
}

interface JsonRpcMessage {
  readonly method: string
  readonly id?: number | string
}

const PORT_RANGE_START = 10000
const PORT_RANGE_END = 65535

function getRandomPort(): number {
  return (
    Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START + 1)) +
    PORT_RANGE_START
  )
}

export class ClaudeCodeServer extends Effect.Service<ClaudeCodeServer>()(
  "ClaudeCodeServer",
  {
    effect: Effect.gen(function* (_) {
      const fsService = yield* _(FileSystem)

      const startServer = Effect.gen(function* (_) {
        broadcastClaudeCodeStatus("connecting")

        const port = getRandomPort()
        const wss = yield* _(
          Effect.async<WebSocketServer, Error>((resume) => {
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
        )
        return { wss, port }
      }).pipe(
        Effect.retry({
          times: 10,
          while: (err: Error & { code?: string }) => err.code === "EADDRINUSE",
        })
      )

      const { wss, port } = yield* _(startServer)
      const authToken = crypto.randomUUID()

      const homeDir = os.homedir()
      const claudeDir = path.join(homeDir, ".claude", "ide")
      // recursive: true means it doesn't fail if the folder already exists
      yield* _(fsService.createFolder(claudeDir, { recursive: true }))
      const lockFilePath = AbsolutePath(path.join(claudeDir, `${port}.lock`))

      wss.on("connection", (ws, req) => {
        const authHeader = req.headers["x-claude-code-ide-authorization"]
        if (authHeader !== authToken) {
          Console.warn("Claude Code Server: Unauthorized connection attempt")
          ws.close(1008, "Unauthorized")
          return
        }

        Console.log("Claude Code Server: Client connected")

        ws.on("message", (message) => {
          try {
            const data = JSON.parse(message.toString()) as JsonRpcMessage

            // Handle initialize request
            if (data.method === "initialize" && data.id !== undefined) {
              ws.send(
                JSON.stringify({
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
                })
              )
              return
            }

            // Track when Claude Code IDE connects (ready to receive context)
            if (data.method === "ide_connected") {
              broadcastClaudeCodeStatus("connected")
              Console.log("Claude Code Server: IDE connected and ready")
              return
            }

            Console.log("Claude Code Server: Received message", data)
          } catch (err) {
            Console.error("Claude Code Server: Error parsing message", err)
          }
        })
      })

      const lockData = {
        pid: process.pid,
        workspaceFolders: [], // We can update this dynamically or fetch from somewhere
        ideName: "spacecake",
        transport: "ws",
        authToken: authToken,
      }

      try {
        yield* _(
          fsService.writeTextFile(lockFilePath, JSON.stringify(lockData))
        )
        Console.log(
          `Claude Code Server listening on port ${port}, lock file: ${lockFilePath}`
        )
      } catch (error) {
        Console.error("Failed to write lock file", error)
      }

      const broadcast = (method: string, params: unknown) => {
        const message = JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
        })
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message)
          }
        })
      }

      // Register IPC handlers
      ipcMain.handle("claude:selection-changed", (_, payload) => {
        broadcast("selection_changed", payload)
      })

      ipcMain.handle("claude:at-mentioned", (_, payload) => {
        broadcast("at_mentioned", payload)
      })

      process.env.CLAUDE_CODE_SSE_PORT = port.toString()
      process.env.ENABLE_IDE_INTEGRATION = "true"

      yield* _(
        Effect.addFinalizer(() =>
          Effect.gen(function* (_) {
            Console.log("Claude Code Server: Stopping...")
            broadcastClaudeCodeStatus("disconnected")
            wss.close()
            const exists = yield* _(fsService.exists(lockFilePath))
            if (exists) {
              yield* _(fsService.remove(lockFilePath))
            }
          }).pipe(Effect.catchAll(() => Effect.void))
        )
      )

      return {
        broadcast,
      }
    }),
    dependencies: [FileSystem.Default],
  }
) {}
