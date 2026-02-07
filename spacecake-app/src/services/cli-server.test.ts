import { Effect, Layer } from "effect"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OpenFilePayload } from "@/types/claude-code"

import { toIpcPath } from "@/lib/ipc-path"
import { FileSystem } from "@/services/file-system"
import { makeSpacecakeHomeTestLayer } from "@/services/spacecake-home"
import { waitForServer } from "@/test-utils/platform"

// ---------------------------------------------------------------------------
// Electron mock — capture ipcMain.handle calls + spy on webContents.send
// ---------------------------------------------------------------------------

interface IpcEvent {
  readonly sender?: unknown
}

const mocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: IpcEvent, ...args: unknown[]) => unknown>(),
  webContentsSend: vi.fn(),
}))

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ webContents: { send: mocks.webContentsSend } }]),
  },
  ipcMain: {
    handle: vi.fn((channel: string, listener: (event: IpcEvent, ...args: unknown[]) => unknown) => {
      mocks.ipcHandlers.set(channel, listener)
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers & state
// ---------------------------------------------------------------------------

// Use path.resolve() for cross-platform compatibility.
// On Windows, path.resolve("/ws/primary") → "D:\ws\primary"
// On Unix, path.resolve("/ws/primary") → "/ws/primary"
const WS_PRIMARY = path.resolve("/ws/primary")
const WS_SECONDARY = path.resolve("/ws/secondary")

interface JsonResponse {
  [key: string]: unknown
}

let testDir: string
let appDir: string
let socketPath: string
let mockFileSystem: Partial<FileSystem>

// We need to dynamically import so the module-level mocks are applied

let makeCliServer: typeof import("@/services/cli-server").makeCliServer

beforeEach(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-server-test-"))
  appDir = path.join(testDir, ".app")
  fs.mkdirSync(appDir, { recursive: true })
  // Use toIpcPath for cross-platform compatibility (named pipes on Windows)
  socketPath = toIpcPath(path.join(appDir, "cli.sock"))

  mockFileSystem = {
    createFolder: vi.fn(() => Effect.void),
    exists: vi.fn(() => Effect.succeed(false)),
    remove: vi.fn(() => Effect.void),
  }

  mocks.ipcHandlers.clear()
  mocks.webContentsSend.mockClear()

  const mod = await import("@/services/cli-server")
  makeCliServer = mod.makeCliServer
})

afterEach(() => {
  try {
    // On Unix, clean up the socket file. On Windows, named pipes don't need cleanup.
    if (process.platform !== "win32" && fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath)
    }
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
})

const createTestLayer = () =>
  Layer.mergeAll(
    Layer.succeed(FileSystem, mockFileSystem as FileSystem),
    makeSpacecakeHomeTestLayer({ homeDir: testDir }),
  )

const runTestServer = (workspaceFolders: string[] = [WS_PRIMARY]) =>
  Effect.gen(function* () {
    const server = yield* makeCliServer.pipe(Effect.provide(createTestLayer()))

    yield* Effect.promise(() => server.ensureStarted(workspaceFolders))

    // Wait for server to be listening (works with both Unix sockets and Windows named pipes)
    yield* Effect.promise(() => waitForServer(socketPath))

    return server
  })

const makeRequest = (
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ statusCode: number; body: JsonResponse }> =>
  new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath,
      path: urlPath,
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    }

    const req = http.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: JSON.parse(data) as JsonResponse,
          })
        } catch {
          resolve({ statusCode: res.statusCode ?? 500, body: {} })
        }
      })
    })

    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CliServer", () => {
  it("GET /health → 200 {status:'ok'}", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer()
          const res = yield* Effect.promise(() => makeRequest("GET", "/health"))
          expect(res.statusCode).toBe(200)
          expect(res.body).toEqual({ status: "ok" })
        }),
      ),
    )
  })

  it("POST /open valid files → 200, broadcasts correct OpenFilePayload", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([WS_PRIMARY])

          const filePath = path.join(WS_PRIMARY, "src", "index.ts")
          const res = yield* Effect.promise(() =>
            makeRequest(
              "POST",
              "/open",
              JSON.stringify({
                files: [{ path: filePath, line: 10, col: 5 }],
              }),
            ),
          )

          expect(res.statusCode).toBe(200)
          expect(res.body).toEqual({ opened: 1 })

          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude:open-file",
            expect.objectContaining({
              workspacePath: WS_PRIMARY,
              filePath: path.resolve(filePath),
              line: 10,
              col: 5,
            } satisfies OpenFilePayload),
          )
        }),
      ),
    )
  })

  it("POST /open file in second workspace → correct workspacePath", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([WS_PRIMARY, WS_SECONDARY])

          const filePath = path.join(WS_SECONDARY, "lib", "foo.ts")
          const res = yield* Effect.promise(() =>
            makeRequest(
              "POST",
              "/open",
              JSON.stringify({
                files: [{ path: filePath }],
              }),
            ),
          )

          expect(res.statusCode).toBe(200)
          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude:open-file",
            expect.objectContaining({
              workspacePath: WS_SECONDARY,
            }),
          )
        }),
      ),
    )
  })

  it("POST /open file outside all workspaces → falls back to primary", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([WS_PRIMARY, WS_SECONDARY])

          const filePath = path.resolve("/other/place/file.ts")
          const res = yield* Effect.promise(() =>
            makeRequest(
              "POST",
              "/open",
              JSON.stringify({
                files: [{ path: filePath }],
              }),
            ),
          )

          expect(res.statusCode).toBe(200)
          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude:open-file",
            expect.objectContaining({
              workspacePath: WS_PRIMARY,
            }),
          )
        }),
      ),
    )
  })

  it("POST /open with empty workspaceFolders → 503", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([])

          const res = yield* Effect.promise(() =>
            makeRequest(
              "POST",
              "/open",
              JSON.stringify({
                files: [{ path: "/any/file.ts" }],
              }),
            ),
          )

          expect(res.statusCode).toBe(503)
          expect(res.body).toEqual({ error: "No workspace open" })
        }),
      ),
    )
  })

  it("POST /open invalid JSON → 400", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer()

          const res = yield* Effect.promise(() => makeRequest("POST", "/open", "not valid json{"))

          expect(res.statusCode).toBe(400)
          expect(res.body).toEqual({ error: "Invalid JSON" })
        }),
      ),
    )
  })

  it("POST /open missing files array → 400", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer()

          const res = yield* Effect.promise(() =>
            makeRequest("POST", "/open", JSON.stringify({ wait: true })),
          )

          expect(res.statusCode).toBe(400)
          expect(res.body).toEqual({ error: "Missing 'files' array" })
        }),
      ),
    )
  })

  it("POST /open with wait:true — held open, cli:file-closed resolves it", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([WS_PRIMARY])

          const filePath = path.join(WS_PRIMARY, "src", "index.ts")
          const resolvedFilePath = path.resolve(filePath)

          // Fire the request (will block until the file is "closed")
          const responsePromise = makeRequest(
            "POST",
            "/open",
            JSON.stringify({
              files: [{ path: filePath }],
              wait: true,
            }),
          )

          // Give the server a moment to register the waiter
          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 200)))

          // Simulate renderer sending file-closed IPC (must use resolved path)
          const handler = mocks.ipcHandlers.get("cli:file-closed")
          expect(handler).toBeDefined()
          handler!({}, resolvedFilePath)

          const res = yield* Effect.promise(() => responsePromise)
          expect(res.statusCode).toBe(200)
          expect(res.body).toEqual({ closed: true })
        }),
      ),
    )
  })

  it("Unknown route → 404", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer()

          const res = yield* Effect.promise(() => makeRequest("GET", "/nonexistent"))

          expect(res.statusCode).toBe(404)
          expect(res.body).toEqual({ error: "Not found" })
        }),
      ),
    )
  })

  it("isStarted() false before start, true after", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* makeCliServer.pipe(Effect.provide(createTestLayer()))

          expect(server.isStarted()).toBe(false)

          yield* Effect.promise(() => server.ensureStarted(["/ws/primary"]))

          expect(server.isStarted()).toBe(true)
        }),
      ),
    )
  })

  it("cli:update-workspaces IPC updates workspace for subsequent /open", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const wsOld = path.resolve("/ws/old")
          const wsNew = path.resolve("/ws/new")

          yield* runTestServer([wsOld])

          // Simulate workspace update via IPC
          const handler = mocks.ipcHandlers.get("cli:update-workspaces")
          expect(handler).toBeDefined()
          handler!({}, [wsNew])

          const filePath = path.join(wsNew, "file.ts")
          const res = yield* Effect.promise(() =>
            makeRequest(
              "POST",
              "/open",
              JSON.stringify({
                files: [{ path: filePath }],
              }),
            ),
          )

          expect(res.statusCode).toBe(200)
          expect(mocks.webContentsSend).toHaveBeenCalledWith(
            "claude:open-file",
            expect.objectContaining({
              workspacePath: wsNew,
            }),
          )
        }),
      ),
    )
  })

  it("Scope exit resolves pending waiters with 503", async () => {
    // We'll run a scoped server, fire a wait request, then let the scope close
    let responsePromise: Promise<{ statusCode: number; body: JsonResponse }>

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runTestServer([WS_PRIMARY])

          const filePath = path.join(WS_PRIMARY, "src", "index.ts")

          // Fire a wait request — won't resolve until file closed or server shuts down
          responsePromise = makeRequest(
            "POST",
            "/open",
            JSON.stringify({
              files: [{ path: filePath }],
              wait: true,
            }),
          )

          // Give server time to register waiter
          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 200)))

          // Scope exits here → finalizer should resolve pending waiters with 503
        }),
      ),
    )

    // Now the scope has closed — the response should have been resolved by the finalizer
    const res = await responsePromise!
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ closed: true })
  })
})
