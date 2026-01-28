import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

import { Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { healthCheck, postOpen, SpacecakeNotRunning } from "./open.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string
let socketPath: string
let testServer: http.Server | null = null

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-open-test-"))
  socketPath = path.join(testDir, "test.sock")
})

afterEach(async () => {
  if (testServer) {
    await new Promise<void>((resolve) => {
      testServer!.close(() => resolve())
    })
    testServer = null
  }
  try {
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath)
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
})

/**
 * Spin up a throwaway http server on the temp unix socket.
 * Returns a function that resolves once the server is listening.
 */
function startMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer = http.createServer(handler)
    testServer.on("error", reject)
    testServer.listen(socketPath, () => resolve())
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("postOpen", () => {
  it("happy path → returns {status:200, body} and server receives correct JSON", async () => {
    let receivedBody = ""
    let receivedMethod = ""
    let receivedPath = ""

    await startMockServer((req, res) => {
      receivedMethod = req.method ?? ""
      receivedPath = req.url ?? ""
      let data = ""
      req.on("data", (chunk) => (data += chunk))
      req.on("end", () => {
        receivedBody = data
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ opened: 1 }))
      })
    })

    const result = await Effect.runPromise(
      postOpen(socketPath, {
        files: [{ path: "/ws/src/index.ts", line: 5, col: 3 }],
      })
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ opened: 1 })
    expect(receivedMethod).toBe("POST")
    expect(receivedPath).toBe("/open")

    const parsed = JSON.parse(receivedBody)
    expect(parsed).toEqual({
      files: [{ path: "/ws/src/index.ts", line: 5, col: 3 }],
    })
  })

  it("with wait:true propagates flag in body", async () => {
    let receivedBody = ""

    await startMockServer((req, res) => {
      let data = ""
      req.on("data", (chunk) => (data += chunk))
      req.on("end", () => {
        receivedBody = data
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ closed: true }))
      })
    })

    await Effect.runPromise(
      postOpen(socketPath, {
        files: [{ path: "/ws/file.ts" }],
        wait: true,
      })
    )

    const parsed = JSON.parse(receivedBody)
    expect(parsed.wait).toBe(true)
  })

  it("nonexistent socket → SpacecakeNotRunning", async () => {
    const nonexistentSocket = path.join(testDir, "does-not-exist.sock")

    const exit = await Effect.runPromiseExit(
      postOpen(nonexistentSocket, {
        files: [{ path: "/ws/file.ts" }],
      })
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const cause = exit.cause
      // Extract the error from the cause
      const error = (cause as { _tag: string; error: unknown }).error
      expect(error).toBeInstanceOf(SpacecakeNotRunning)
    }
  })

  it("server returns 503 → result has status:503 (not an Effect error)", async () => {
    await startMockServer((_req, res) => {
      // Drain body
      _req.resume()
      _req.on("end", () => {
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "No workspace open" }))
      })
    })

    const result = await Effect.runPromise(
      postOpen(socketPath, {
        files: [{ path: "/ws/file.ts" }],
      })
    )

    expect(result.status).toBe(503)
    expect(JSON.parse(result.body)).toEqual({ error: "No workspace open" })
  })
})

describe("healthCheck", () => {
  it("live server → true", async () => {
    await startMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok" }))
    })

    const result = await Effect.runPromise(healthCheck(socketPath))
    expect(result).toBe(true)
  })

  it("nonexistent socket → false", async () => {
    const nonexistentSocket = path.join(testDir, "does-not-exist.sock")

    // healthCheck catches errors internally and returns false
    // But the implementation wraps in tryPromise which maps to SpacecakeNotRunning
    // Looking at the source: the inner promise resolves false on error,
    // so the Effect should succeed with false (the tryPromise catch is for
    // unexpected promise rejections, but the inner promise never rejects).
    const result = await Effect.runPromise(healthCheck(nonexistentSocket))
    expect(result).toBe(false)
  })
})
