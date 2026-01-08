/**
 * @vitest-environment jsdom
 */
import path from "path"

import * as React from "react"
import { act } from "react"
import { makeClaudeCodeServer } from "@/services/claude-code-server"
import { FileSystem } from "@/services/file-system"
import { Effect, Fiber, Layer } from "effect"
import { Provider } from "jotai"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import { ClaudeStatusBadge } from "@/components/claude-status-badge"

// --- Mocks & Bridge Setup ---

// 1. Mock window.electronAPI (Renderer side)
type StatusChangeCallback = (status: string) => void
const rendererListeners = new Set<StatusChangeCallback>()
vi.stubGlobal("window", {
  electronAPI: {
    claude: {
      onStatusChange: (callback: StatusChangeCallback) => {
        rendererListeners.add(callback)
        return () => rendererListeners.delete(callback)
      },
    },
  },
})

// 2. Mock electron (Main side) & Bridge
vi.mock("electron", () => {
  return {
    BrowserWindow: {
      getAllWindows: () => [
        {
          webContents: {
            send: (channel: string, data: string) => {
              if (channel === "claude-code-status") {
                // BRIDGE: Main -> Renderer
                rendererListeners.forEach((listener) => listener(data))
              }
            },
          },
        },
      ],
    },
    ipcMain: {
      handle: vi.fn(),
    },
  }
})

// 3. Mock FileSystem for ClaudeCodeServer
interface LockFileContent {
  readonly authToken: string
}

let lockFileData: LockFileContent | null = null
let serverPort: number = 0

const mockFileSystem: Partial<FileSystem> = {
  createFolder: vi.fn(() => Effect.void),
  writeTextFile: vi.fn((filePath: string, content: string) => {
    if (filePath.endsWith(".lock")) {
      lockFileData = JSON.parse(content) as LockFileContent
      const basename = path.basename(filePath)
      serverPort = parseInt(basename.replace(".lock", ""))
    }
    return Effect.void
  }),
  exists: vi.fn(() => Effect.succeed(true)),
  remove: vi.fn(() => Effect.void),
}

const FileSystemTestLayer = Layer.succeed(
  FileSystem,
  mockFileSystem as FileSystem
)

describe("ClaudeStatusBadge Integration", () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    // Reset mocks/state
    rendererListeners.clear()
    lockFileData = null
    serverPort = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (container) {
      document.body.removeChild(container)
    }
  })

  it("updates badge status through connecting -> connected -> disconnected sequence", async () => {
    await Effect.runPromise(
      Effect.gen(function* (_) {
        // 1. Start the Claude Code Server wrapped in its own scope
        // When the fiber is interrupted, the scope closes and the finalizer runs
        const serverFiber = yield* _(
          Effect.scoped(
            makeClaudeCodeServer.pipe(
              Effect.provide(FileSystemTestLayer),
              Effect.flatMap(() => Effect.never)
            )
          ).pipe(Effect.fork)
        )

        // 2. Render the Component
        // We render immediately to catch the status updates
        yield* _(
          Effect.promise(async () => {
            await act(async () => {
              if (!root) throw new Error("root is not initialized")
              root.render(
                <Provider>
                  <ClaudeStatusBadge />
                </Provider>
              )
            })
          })
        )

        // Wait for server to be ready (port assigned) so we can connect
        yield* _(
          Effect.promise(async () => {
            let attempts = 0
            while ((!lockFileData || !serverPort) && attempts < 50) {
              await new Promise((resolve) => setTimeout(resolve, 50))
              attempts++
            }
            if (!lockFileData) throw new Error("Server failed to start")
          })
        )

        // 4. Simulate Claude Code connecting via WebSocket
        if (!lockFileData) throw new Error("lockFileData is not initialized")
        const ws = new WebSocket(`ws://localhost:${serverPort}`, {
          headers: {
            "x-claude-code-ide-authorization": lockFileData.authToken,
          },
        })

        yield* _(
          Effect.async<void, Error>((resume) => {
            ws.on("open", () => resume(Effect.succeed(undefined)))
            ws.on("error", (err) => resume(Effect.fail(err)))
          })
        )

        // 5. Send 'ide_connected' message -> Expect 'connected'
        const connectedMessage = {
          method: "ide_connected",
          params: { pid: 12345 },
          jsonrpc: "2.0",
        }
        ws.send(JSON.stringify(connectedMessage))

        yield* _(
          Effect.promise(async () => {
            await vi.waitFor(
              () => {
                const badge = container?.querySelector(
                  "div[title='claude code connected']"
                )
                expect(badge).toBeTruthy()
              },
              { timeout: 2000 }
            )
          })
        )

        // 6. Interrupt the server fiber -> Expect 'disconnected'
        // Interrupting closes the scoped effect, triggering the finalizer
        yield* _(Fiber.interrupt(serverFiber))

        yield* _(
          Effect.promise(async () => {
            await vi.waitFor(
              () => {
                const badge = container?.querySelector(
                  "div[title='claude code disconnected']"
                )
                expect(badge).toBeTruthy()
              },
              { timeout: 2000 }
            )
          })
        )

        ws.close()
      }).pipe(
        Effect.catchAllCause((cause) => {
          console.error("TEST FAILURE CAUSE:", cause.toString())
          return Effect.fail(cause)
        })
      )
    )
  })
})
