import path from "path"

import { makeClaudeCodeServer } from "@/services/claude-code-server"
import { FileSystem } from "@/services/file-system"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import { SelectionChangedPayload } from "@/types/claude-code"

interface IpcEvent {
  readonly sender?: unknown
}

const mocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: IpcEvent, ...args: unknown[]) => void>(),
  webContentsSend: vi.fn(),
}))

// Mock Electron
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      { webContents: { send: mocks.webContentsSend } },
    ]),
  },
  ipcMain: {
    handle: vi.fn((channel, listener) => {
      mocks.ipcHandlers.set(channel, listener)
    }),
  },
}))

interface LockFileData {
  readonly pid: number
  readonly workspaceFolders: readonly string[]
  readonly ideName: string
  readonly transport: string
  readonly authToken: string
}

interface JsonRpcResponse {
  readonly jsonrpc: string
  readonly method: string
  readonly params: SelectionChangedPayload
}

describe("ClaudeCodeServer", () => {
  let lockFileData: LockFileData | null = null
  let serverPort: number = 0
  let mockFileSystem: Partial<FileSystem>

  beforeEach(() => {
    lockFileData = null
    serverPort = 0
    mocks.ipcHandlers.clear()
    mocks.webContentsSend.mockClear()
    mockFileSystem = {
      createFolder: vi.fn(() => Effect.void),
      writeTextFile: vi.fn((filePath: string, content: string) => {
        if (filePath.endsWith(".lock")) {
          lockFileData = JSON.parse(content) as LockFileData
          const basename = path.basename(filePath)
          serverPort = parseInt(basename.replace(".lock", ""))
        }
        return Effect.void
      }),
      exists: vi.fn(() => Effect.succeed(true)),
      remove: vi.fn(() => Effect.void),
    }
  })

  const createTestLayer = () =>
    Layer.succeed(FileSystem, mockFileSystem as FileSystem)

  const runTestServer = () => {
    return Effect.gen(function* (_) {
      const scope = yield* _(Effect.scope)
      const serverFiber = yield* _(
        makeClaudeCodeServer.pipe(
          Effect.provide(createTestLayer()),
          Effect.forkIn(scope)
        )
      )

      // Wait for server to start
      yield* _(
        Effect.promise(async () => {
          let attempts = 0
          while ((!lockFileData || !serverPort) && attempts < 20) {
            await new Promise((resolve) => setTimeout(resolve, 50))
            attempts++
          }
          if (!lockFileData) throw new Error("Server failed to start")
        })
      )

      return {
        serverFiber,
        lockFileData: lockFileData as LockFileData,
        port: serverPort,
      }
    })
  }

  it("should accept valid request with correct auth token", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const { lockFileData, port } = yield* _(runTestServer())
          const expectedToken = lockFileData.authToken

          const ws = new WebSocket(`ws://localhost:${port}`, {
            headers: {
              "x-claude-code-ide-authorization": expectedToken,
            },
          })

          const connected = yield* _(
            Effect.async<boolean, Error>((resume) => {
              ws.on("open", () => resume(Effect.succeed(true)))
              ws.on("error", (err) => resume(Effect.fail(err)))
            })
          )

          expect(connected).toBe(true)
          ws.close()
        })
      )
    )
  })

  it("should reject request with incorrect auth token", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const { port } = yield* _(runTestServer())
          const wrongToken = "wrong-token"

          const ws = new WebSocket(`ws://localhost:${port}`, {
            headers: {
              "x-claude-code-ide-authorization": wrongToken,
            },
          })

          const closeCode = yield* _(
            Effect.async<number, Error>((resume) => {
              // The server accepts the connection then closes it
              ws.on("close", (code) => resume(Effect.succeed(code)))
              ws.on("error", (err) => resume(Effect.fail(err)))
            })
          )

          expect(closeCode).toBe(1008)
        })
      )
    )
  })

  it("should reject request with missing auth token", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const { port } = yield* _(runTestServer())

          const ws = new WebSocket(`ws://localhost:${port}`)

          const closeCode = yield* _(
            Effect.async<number, Error>((resume) => {
              ws.on("close", (code) => resume(Effect.succeed(code)))
              ws.on("error", (err) => resume(Effect.fail(err)))
            })
          )

          expect(closeCode).toBe(1008)
        })
      )
    )
  })

  it("should broadcast selection changed event when ipc handler is called", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const { lockFileData, port } = yield* _(runTestServer())
          const expectedToken = lockFileData.authToken

          const ws = new WebSocket(`ws://localhost:${port}`, {
            headers: {
              "x-claude-code-ide-authorization": expectedToken,
            },
          })

          // Wait for connection
          yield* _(
            Effect.async<void, Error>((resume) => {
              ws.on("open", () => resume(Effect.succeed(undefined)))
              ws.on("error", (err) => resume(Effect.fail(err)))
            })
          )

          // Prepare to receive message
          const messagePromise = new Promise<JsonRpcResponse>((resolve) => {
            ws.once("message", (data) => {
              resolve(JSON.parse(data.toString()) as JsonRpcResponse)
            })
          })

          // Trigger IPC handler
          const handler = mocks.ipcHandlers.get("claude:selection-changed")
          if (!handler) throw new Error("Handler not registered")

          const payload: SelectionChangedPayload = {
            text: "const x = 1",
            filePath: "/path/to/test.ts",
            selection: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 11 },
              isEmpty: false,
            },
          }
          // Trigger the handler. First arg is event (mocked as {}), second is payload
          handler({}, payload)

          // Verify message
          const message = yield* _(Effect.promise(() => messagePromise))
          expect(message).toEqual({
            jsonrpc: "2.0",
            method: "selection_changed",
            params: payload,
          })

          ws.close()
        })
      )
    )
  })

  it("should broadcast 'connected' status when ide_connected message is received", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const { lockFileData, port } = yield* _(runTestServer())
          const expectedToken = lockFileData.authToken

          // Expect "connecting" to have been broadcast on startup
          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude-code-status",
            "connecting"
          )
          mocks.webContentsSend.mockClear()

          const ws = new WebSocket(`ws://localhost:${port}`, {
            headers: {
              "x-claude-code-ide-authorization": expectedToken,
            },
          })

          // Wait for connection
          yield* _(
            Effect.async<void, Error>((resume) => {
              ws.on("open", () => resume(Effect.succeed(undefined)))
              ws.on("error", (err) => resume(Effect.fail(err)))
            })
          )

          const message = {
            method: "ide_connected",
            params: { pid: 66484 },
            jsonrpc: "2.0",
          }
          ws.send(JSON.stringify(message))

          // Wait for broadcast to happen
          yield* _(
            Effect.promise(async () => {
              let attempts = 0
              // Check if called with specific args
              while (
                !mocks.webContentsSend.mock.calls.some(
                  (args: readonly unknown[]) =>
                    args[0] === "claude-code-status" && args[1] === "connected"
                ) &&
                attempts < 20
              ) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                attempts++
              }
            })
          )

          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude-code-status",
            "connected"
          )

          ws.close()
        })
      )
    )
  })
})
