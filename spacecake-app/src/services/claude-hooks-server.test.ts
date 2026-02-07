import { Effect, Layer } from "effect"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { toIpcPath } from "@/lib/ipc-path"
import { makeClaudeConfigTestLayer } from "@/services/claude-config"
import { makeClaudeHooksServer, StatuslineService } from "@/services/claude-hooks-server"
import { FileSystem } from "@/services/file-system"
import { waitForServer } from "@/test-utils/platform"
import { StatuslineInput } from "@/types/statusline"

import statuslineFixture from "../../tests/fixtures/claude/statusline.json"

interface JsonResponse {
  success?: boolean
  error?: string
  status?: string
}

// Official statusline example from Anthropic
const validStatuslineInput = statuslineFixture as StatuslineInput

describe("ClaudeHooksServer", () => {
  let testDir: string
  let socketPath: string
  let mockFileSystem: Partial<FileSystem>

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-hooks-test-"))
    // Use toIpcPath for cross-platform compatibility (named pipes on Windows)
    socketPath = toIpcPath(path.join(testDir, "spacecake.sock"))

    mockFileSystem = {
      createFolder: vi.fn(() => Effect.void),
      exists: vi.fn(() => Effect.succeed(false)),
      remove: vi.fn(() => Effect.void),
    }
  })

  afterEach(() => {
    // Clean up test directory
    try {
      // On Unix, clean up the socket file. On Windows, named pipes don't need cleanup.
      if (process.platform !== "win32" && fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath)
      }
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  const createTestLayer = () => {
    return Layer.mergeAll(
      makeClaudeConfigTestLayer(testDir),
      Layer.succeed(FileSystem, mockFileSystem as FileSystem),
      StatuslineService.Default,
    )
  }

  const makeRequest = (
    method: string,
    urlPath: string,
    body?: string,
  ): Promise<{ statusCode: number; body: JsonResponse }> => {
    return new Promise((resolve, reject) => {
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
            resolve({
              statusCode: res.statusCode ?? 500,
              body: {} as JsonResponse,
            })
          }
        })
      })

      req.on("error", reject)
      if (body) req.write(body)
      req.end()
    })
  }

  const runTestServer = () => {
    return Effect.gen(function* (_) {
      const server = yield* _(makeClaudeHooksServer.pipe(Effect.provide(createTestLayer())))

      // Start the server
      yield* _(Effect.promise(() => server.ensureStarted()))

      // Wait for server to be listening (works with both Unix sockets and Windows named pipes)
      yield* _(Effect.promise(() => waitForServer(socketPath)))

      return server
    })
  }

  it("should start server and respond to health check", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const response = yield* _(Effect.promise(() => makeRequest("GET", "/health")))

          expect(response.statusCode).toBe(200)
          expect(response.body).toEqual({ status: "ok" })
        }),
      ),
    )
  })

  it("should return 404 for unknown routes", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const response = yield* _(Effect.promise(() => makeRequest("GET", "/unknown")))

          expect(response.statusCode).toBe(404)
          expect(response.body).toEqual({ error: "Not found" })
        }),
      ),
    )
  })

  it("should accept valid statusline data and return 200", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const statuslineData = validStatuslineInput

          const response = yield* _(
            Effect.promise(() =>
              makeRequest("POST", "/statusline", JSON.stringify(statuslineData)),
            ),
          )

          expect(response.statusCode).toBe(200)
          expect(response.body).toEqual({ success: true })
        }),
      ),
    )
  })

  it("should return 400 for invalid statusline data (missing fields)", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const invalidData = {
            model: "claude-sonnet-4-20250514",
            // missing context_window and cost
          }

          const response = yield* _(
            Effect.promise(() => makeRequest("POST", "/statusline", JSON.stringify(invalidData))),
          )

          expect(response.statusCode).toBe(400)
          expect(response.body).toEqual({ error: "Invalid statusline data" })
        }),
      ),
    )
  })

  it("should return 400 for invalid JSON", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const response = yield* _(
            Effect.promise(() => makeRequest("POST", "/statusline", "not valid json{")),
          )

          expect(response.statusCode).toBe(400)
          expect(response.body).toEqual({ error: "Failed to parse JSON" })
        }),
      ),
    )
  })

  it("should trigger onStatuslineUpdate callback when data is received", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const server = yield* _(runTestServer())

          const receivedData: unknown[] = []
          server.onStatuslineUpdate((data) => {
            receivedData.push(data)
          })

          const statuslineData = validStatuslineInput

          yield* _(
            Effect.promise(() =>
              makeRequest("POST", "/statusline", JSON.stringify(statuslineData)),
            ),
          )

          // Wait for callback to be triggered
          yield* _(
            Effect.promise(async () => {
              let attempts = 0
              while (receivedData.length === 0 && attempts < 20) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                attempts++
              }
            }),
          )

          expect(receivedData.length).toBe(1)
          expect(receivedData[0]).toMatchObject({
            model: "Opus",
            contextUsagePercent: 42.5,
            costUsd: 0.01234,
          })
        }),
      ),
    )
  })

  it("should store last statusline and return it via getLastStatusline", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const server = yield* _(runTestServer())

          // Initially null
          expect(server.getLastStatusline()).toBeNull()

          yield* _(
            Effect.promise(() =>
              makeRequest("POST", "/statusline", JSON.stringify(validStatuslineInput)),
            ),
          )

          // Wait for processing
          yield* _(
            Effect.promise(async () => {
              let attempts = 0
              while (server.getLastStatusline() === null && attempts < 20) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                attempts++
              }
            }),
          )

          const lastStatusline = server.getLastStatusline()
          expect(lastStatusline).not.toBeNull()
          expect(lastStatusline?.model).toBe("Opus")
        }),
      ),
    )
  })

  it("should report correct isStarted state", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const server = yield* _(makeClaudeHooksServer.pipe(Effect.provide(createTestLayer())))

          // Before starting
          expect(server.isStarted()).toBe(false)

          // Start the server
          yield* _(Effect.promise(() => server.ensureStarted()))

          // After starting
          expect(server.isStarted()).toBe(true)
        }),
      ),
    )
  })

  it("should unsubscribe callback when cleanup function is called", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          const server = yield* _(runTestServer())

          const receivedData: unknown[] = []
          const unsubscribe = server.onStatuslineUpdate((data) => {
            receivedData.push(data)
          })

          // Unsubscribe immediately
          unsubscribe()

          const statuslineData = validStatuslineInput

          yield* _(
            Effect.promise(() =>
              makeRequest("POST", "/statusline", JSON.stringify(statuslineData)),
            ),
          )

          // Wait a bit to ensure callback would have been called
          yield* _(Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 100))))

          // Should not have received any data since we unsubscribed
          expect(receivedData.length).toBe(0)
        }),
      ),
    )
  })

  it("should handle OPTIONS request for CORS preflight", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(runTestServer())

          const response = yield* _(Effect.promise(() => makeRequest("OPTIONS", "/statusline")))

          expect(response.statusCode).toBe(200)
        }),
      ),
    )
  })
})
