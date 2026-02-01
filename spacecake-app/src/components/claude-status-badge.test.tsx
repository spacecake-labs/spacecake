import { Effect, Fiber, Layer } from "effect"
import { Provider } from "jotai"
/**
 * @vitest-environment jsdom
 */
import path from "path"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import type { PaneMachineRef } from "@/machines/pane"

import { ClaudeStatusBadge } from "@/components/claude-status-badge"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { makeClaudeCodeServer } from "@/services/claude-code-server"
import { makeClaudeConfigTestLayer } from "@/services/claude-config"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { FileSystem } from "@/services/file-system"

// Mock pane machine for tests
const mockPaneMachine = {
  send: vi.fn(),
} as unknown as PaneMachineRef

// Mock web-tree-sitter to avoid WASM loading issues in tests
vi.mock("web-tree-sitter", () => {
  return {
    Parser: class {
      static init = vi.fn()
      setLanguage = vi.fn()
      parse = vi.fn(() => ({
        rootNode: {
          children: [],
        },
      }))
    },
  }
})

vi.mock("@/lib/parser/languages", () => {
  const mockQuery = {
    exec: () => [],
  }

  const mockLanguage = {
    query: () => mockQuery,
  }

  return {
    default: Promise.resolve({
      Python: mockLanguage,
    }),
  }
})

// Suppress act() warnings for this integration test - WebSocket message handling
// is async and can't be wrapped in act() without blocking the event loop
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message === "string" && message.includes("was not wrapped in act")) {
      return
    }
    originalConsoleError.apply(console, args)
  }
})
afterAll(() => {
  console.error = originalConsoleError
})

// --- Mocks & Bridge Setup ---

// 1. Mock window.electronAPI (Renderer side)
type StatusChangeCallback = (status: string) => void
type StatuslineUpdateCallback = (statusline: unknown) => void
const rendererListeners = new Set<StatusChangeCallback>()
const statuslineListeners = new Set<StatuslineUpdateCallback>()
Object.defineProperty(window, "electronAPI", {
  writable: true,
  value: {
    claude: {
      onStatusChange: (callback: StatusChangeCallback) => {
        rendererListeners.add(callback)
        return () => rendererListeners.delete(callback)
      },
      onStatuslineUpdate: (callback: StatuslineUpdateCallback) => {
        statuslineListeners.add(callback)
        return () => statuslineListeners.delete(callback)
      },
      onOpenFile: () => () => {},
      ensureServer: () => Promise.resolve(),
    },
    updateCliWorkspaces: () => Promise.resolve(),
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

const mockClaudeHooksServer = {
  ensureStarted: vi.fn(() => Promise.resolve(10000)),
  isStarted: vi.fn(() => true),
  getLastStatusline: vi.fn(() => null),
  onStatuslineUpdate: vi.fn(() => () => {}),
}

const FileSystemTestLayer = Layer.succeed(FileSystem, mockFileSystem as FileSystem)

const ClaudeHooksServerTestLayer = Layer.succeed(
  ClaudeHooksServer,
  mockClaudeHooksServer as unknown as ClaudeHooksServer,
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
    statuslineListeners.clear()
    lockFileData = null
    serverPort = 0
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Properly unmount React before removing DOM to flush pending updates
    await act(async () => {
      root?.unmount()
    })
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
              Effect.provide(
                Layer.mergeAll(
                  makeClaudeConfigTestLayer("/tmp/test-claude"),
                  FileSystemTestLayer,
                  ClaudeHooksServerTestLayer,
                ),
              ),
              Effect.tap((server) =>
                Effect.promise(() => server.ensureStarted(["/test/workspace"])),
              ),
              Effect.flatMap(() => Effect.never),
            ),
          ).pipe(Effect.fork),
        )

        // 2. Render the Component
        // We render immediately to catch the status updates
        // The provider is enabled immediately so listeners are set up after ensureServer resolves
        yield* _(
          Effect.promise(async () => {
            await act(async () => {
              if (!root) throw new Error("root is not initialized")
              root.render(
                <Provider>
                  <ClaudeIntegrationProvider
                    workspacePath="/test/workspace"
                    enabled={true}
                    machine={mockPaneMachine}
                  >
                    <ClaudeStatusBadge />
                  </ClaudeIntegrationProvider>
                </Provider>,
              )
            })
            // Wait for the provider to set up listeners after ensureServer resolves
            await new Promise((resolve) => setTimeout(resolve, 50))
          }),
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
          }),
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
          }),
        )

        // 5. Send 'initialize' message -> Expect 'connecting' (yellow)
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

        // Note: vi.waitFor is intentionally not wrapped in act() here because
        // the WebSocket message handling is async and act() would block the event loop
        yield* _(
          Effect.promise(async () => {
            await vi.waitFor(
              () => {
                const badge = container?.querySelector("div[data-ide-status='connecting']")
                expect(badge).toBeTruthy()
              },
              { timeout: 2000 },
            )
          }),
        )

        // 6. Send 'ide_connected' message -> Expect 'connected' (green)
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
                const badge = container?.querySelector("div[data-ide-status='connected']")
                expect(badge).toBeTruthy()
              },
              { timeout: 2000 },
            )
          }),
        )

        // 7. Interrupt the server fiber -> Expect 'disconnected'
        // Interrupting closes the scoped effect, triggering the finalizer
        yield* _(Fiber.interrupt(serverFiber))

        yield* _(
          Effect.promise(async () => {
            await vi.waitFor(
              () => {
                const badge = container?.querySelector("div[data-ide-status='disconnected']")
                expect(badge).toBeTruthy()
              },
              { timeout: 2000 },
            )
          }),
        )

        ws.close()
      }).pipe(
        Effect.catchAllCause((cause) => {
          console.error("TEST FAILURE CAUSE:", cause.toString())
          return Effect.fail(cause)
        }),
      ),
    )
  })
})
