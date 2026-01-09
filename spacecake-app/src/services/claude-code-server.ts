import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"

import { FileSystem } from "@/services/file-system"
import { Console, Effect, Either, Schema } from "effect"
import { BrowserWindow, ipcMain } from "electron"
import { WebSocket, WebSocketServer } from "ws"

import type { ClaudeCodeStatus } from "@/types/claude-code"
import {
  AtMentionedPayloadSchema,
  SelectionChangedPayloadSchema,
} from "@/types/claude-code"
import { JsonRpcMessageSchema, type JsonRpcResponse } from "@/types/rpc"
import { AbsolutePath } from "@/types/workspace"

function broadcastClaudeCodeStatus(status: ClaudeCodeStatus) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("claude-code-status", status)
  })
}

export interface ClaudeCodeServerService {
  readonly broadcast: (method: string, params: unknown) => void
}

const PORT_RANGE_START = 10000
const PORT_RANGE_END = 65535

function getRandomPort(): number {
  return (
    Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START + 1)) +
    PORT_RANGE_START
  )
}

export const makeClaudeCodeServer = Effect.gen(function* (_) {
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
      let parsed: unknown
      try {
        parsed = JSON.parse(message.toString())
      } catch (err) {
        Console.error("claude code server: failed to parse json", err)
        return
      }

      const decoded = Schema.decodeUnknownEither(JsonRpcMessageSchema)(parsed)
      if (Either.isLeft(decoded)) {
        Console.error(
          "claude code server: invalid json-rpc message",
          decoded.left
        )
        return
      }

      const data = decoded.right

      // Handle initialize request
      if (
        data.method === "initialize" &&
        data.id !== null &&
        data.id !== undefined
      ) {
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

      // Track when Claude Code IDE connects (ready to receive context)
      if (data.method === "ide_connected") {
        broadcastClaudeCodeStatus("connected")
        Console.log("claude code server: ide connected and ready")
        return
      }
      Console.log("claude code server: received message", data)
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
    yield* _(fsService.writeTextFile(lockFilePath, JSON.stringify(lockData)))
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
    const decoded = Schema.decodeUnknownEither(SelectionChangedPayloadSchema)(
      payload
    )
    if (Either.isLeft(decoded)) {
      Console.error(
        "claude code server: invalid selection changed payload",
        decoded.left
      )
      return
    }
    broadcast("selection_changed", decoded.right)
  })

  ipcMain.handle("claude:at-mentioned", (_, payload) => {
    const decoded = Schema.decodeUnknownEither(AtMentionedPayloadSchema)(
      payload
    )
    if (Either.isLeft(decoded)) {
      Console.error(
        "claude code server: invalid at-mentioned payload",
        decoded.left
      )
      return
    }
    broadcast("at_mentioned", decoded.right)
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
})

export class ClaudeCodeServer extends Effect.Service<ClaudeCodeServer>()(
  "ClaudeCodeServer",
  {
    effect: makeClaudeCodeServer,
    dependencies: [FileSystem.Default],
  }
) {}
