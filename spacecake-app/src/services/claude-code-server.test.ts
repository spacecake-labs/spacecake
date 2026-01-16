import path from "path"

import { makeClaudeCodeServer } from "@/services/claude-code-server"
import { FileSystem } from "@/services/file-system"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import { OpenFilePayload, SelectionChangedPayload } from "@/types/claude-code"

interface IpcEvent {
  readonly sender?: unknown
}

interface ToolsListResponse {
  readonly jsonrpc: string
  readonly id: number
  readonly result: {
    readonly tools: ReadonlyArray<{
      readonly name: string
      readonly description: string
      readonly inputSchema: unknown
    }>
  }
}

interface ToolCallResponse {
  readonly jsonrpc: string
  readonly id: number
  readonly result: {
    readonly content: ReadonlyArray<{
      readonly type: string
      readonly text: string
    }>
    readonly isError?: boolean
  }
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
      const server = yield* _(
        makeClaudeCodeServer.pipe(Effect.provide(createTestLayer()))
      )

      // Actually start the server (it's lazy now)
      yield* _(Effect.promise(() => server.ensureStarted(["/test/workspace"])))

      // Fork to keep the server alive in the scope
      const serverFiber = yield* _(Effect.never.pipe(Effect.forkIn(scope)))

      // Wait for server to be ready (lock file written)
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

  it("should broadcast 'connecting' on initialize and 'connected' on ide_connected", async () => {
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

          // Send initialize message - should trigger "connecting" status
          const initMessage = {
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: { roots: {} },
              clientInfo: { name: "claude-code", version: "1.0.0" },
            },
            jsonrpc: "2.0",
            id: 0,
          }
          ws.send(JSON.stringify(initMessage))

          // Wait for "connecting" broadcast
          yield* _(
            Effect.promise(async () => {
              let attempts = 0
              while (
                !mocks.webContentsSend.mock.calls.some(
                  (args: readonly unknown[]) =>
                    args[0] === "claude-code-status" && args[1] === "connecting"
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
            "connecting"
          )
          mocks.webContentsSend.mockClear()

          // Send ide_connected message - should trigger "connected" status
          const connectedMessage = {
            method: "ide_connected",
            params: { pid: 66484 },
            jsonrpc: "2.0",
          }
          ws.send(JSON.stringify(connectedMessage))

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

  it("should respond to tools/list with available tools including openFile", async () => {
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

          // Prepare to receive response
          const responsePromise = new Promise<ToolsListResponse>((resolve) => {
            ws.once("message", (data) => {
              resolve(JSON.parse(data.toString()) as ToolsListResponse)
            })
          })

          // Send tools/list request
          const toolsListMessage = {
            method: "tools/list",
            jsonrpc: "2.0",
            id: 1,
          }
          ws.send(JSON.stringify(toolsListMessage))

          // Verify response
          const response = yield* _(Effect.promise(() => responsePromise))
          expect(response.jsonrpc).toBe("2.0")
          expect(response.id).toBe(1)
          expect(response.result.tools).toBeInstanceOf(Array)
          expect(response.result.tools.length).toBeGreaterThan(0)

          const openFileTool = response.result.tools.find(
            (t) => t.name === "openFile"
          )
          expect(openFileTool).toBeDefined()
          expect(openFileTool?.description).toContain("Open a file")

          ws.close()
        })
      )
    )
  })

  it("should handle tools/call openFile and broadcast open-file event", async () => {
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

          // Prepare to receive response
          const responsePromise = new Promise<ToolCallResponse>((resolve) => {
            ws.once("message", (data) => {
              resolve(JSON.parse(data.toString()) as ToolCallResponse)
            })
          })

          // Send tools/call request for openFile
          const toolCallMessage = {
            method: "tools/call",
            params: {
              name: "openFile",
              arguments: {
                filePath: "/test/workspace/src/index.ts",
              },
            },
            jsonrpc: "2.0",
            id: 2,
          }
          ws.send(JSON.stringify(toolCallMessage))

          // Verify response
          const response = yield* _(Effect.promise(() => responsePromise))
          expect(response.jsonrpc).toBe("2.0")
          expect(response.id).toBe(2)
          expect(response.result.isError).toBeUndefined()
          expect(response.result.content[0].text).toContain(
            "Opened file: /test/workspace/src/index.ts"
          )

          // Verify broadcast was sent
          yield* _(
            Effect.promise(async () => {
              let attempts = 0
              while (
                !mocks.webContentsSend.mock.calls.some(
                  (args: readonly unknown[]) => args[0] === "claude:open-file"
                ) &&
                attempts < 20
              ) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                attempts++
              }
            })
          )

          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude:open-file",
            expect.objectContaining({
              workspacePath: "/test/workspace",
              filePath: "/test/workspace/src/index.ts",
            } satisfies OpenFilePayload)
          )

          ws.close()
        })
      )
    )
  })

  it("should return error when openFile is called with file outside workspace", async () => {
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

          // Prepare to receive response
          const responsePromise = new Promise<ToolCallResponse>((resolve) => {
            ws.once("message", (data) => {
              resolve(JSON.parse(data.toString()) as ToolCallResponse)
            })
          })

          // Send tools/call request with file outside workspace
          const toolCallMessage = {
            method: "tools/call",
            params: {
              name: "openFile",
              arguments: {
                filePath: "/some/other/path/file.ts",
              },
            },
            jsonrpc: "2.0",
            id: 3,
          }
          ws.send(JSON.stringify(toolCallMessage))

          // Verify error response
          const response = yield* _(Effect.promise(() => responsePromise))
          expect(response.jsonrpc).toBe("2.0")
          expect(response.id).toBe(3)
          expect(response.result.isError).toBe(true)
          expect(response.result.content[0].text).toContain(
            "not in any open workspace"
          )

          ws.close()
        })
      )
    )
  })
})
