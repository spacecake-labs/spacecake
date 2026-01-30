/**
 * `spacecake open` — send file-open requests to a running spacecake instance
 * over the CLI Unix domain socket.
 */
import http from "node:http"

import { Data, Effect } from "effect"

// ---------------------------------------------------------------------------
// Tagged errors
// ---------------------------------------------------------------------------

export class SpacecakeNotRunning extends Data.TaggedError(
  "SpacecakeNotRunning"
)<{
  readonly message: string
}> {}

export class OpenRequestFailed extends Data.TaggedError("OpenRequestFailed")<{
  readonly message: string
}> {}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenFileEntry {
  path: string
  line?: number
  col?: number
}

interface OpenRequest {
  files: OpenFileEntry[]
  wait?: boolean
}

// ---------------------------------------------------------------------------
// IPC helpers
// ---------------------------------------------------------------------------

/**
 * POST a JSON body to the Unix socket and return the parsed response.
 * Resolves when the server responds (immediately for non-wait, or
 * when the file tab is closed for --wait).
 */
export function postOpen(
  socketPath: string,
  body: OpenRequest
): Effect.Effect<
  { status: number; body: string },
  SpacecakeNotRunning | OpenRequestFailed
> {
  return Effect.tryPromise({
    try: () =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const payload = JSON.stringify(body)

        const req = http.request(
          {
            socketPath,
            path: "/open",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          (res) => {
            let data = ""
            res.on("data", (chunk: Buffer) => {
              data += chunk.toString()
            })
            res.on("end", () => {
              resolve({ status: res.statusCode ?? 0, body: data })
            })
          }
        )

        req.on("error", (err: NodeJS.ErrnoException) => {
          reject(err)
        })

        req.write(payload)
        req.end()
      }),
    catch: (err) => {
      const e = err as NodeJS.ErrnoException
      if (e.code === "ENOENT" || e.code === "ECONNREFUSED") {
        return new SpacecakeNotRunning({
          message: "spacecake is not running. Launch spacecake first.",
        })
      }
      return new OpenRequestFailed({
        message: e.message ?? "Failed to communicate with spacecake.",
      })
    },
  })
}

/**
 * GET /health to check if spacecake is alive.
 */
export function healthCheck(
  socketPath: string
): Effect.Effect<boolean, SpacecakeNotRunning> {
  return Effect.tryPromise({
    try: () =>
      new Promise<boolean>((resolve) => {
        const req = http.request(
          {
            socketPath,
            path: "/health",
            method: "GET",
          },
          (res) => {
            res.resume()
            res.on("end", () => {
              resolve(res.statusCode === 200)
            })
          }
        )

        req.on("error", () => {
          resolve(false)
        })

        req.end()
      }),
    catch: () =>
      new SpacecakeNotRunning({
        message: "spacecake is not running. Launch spacecake first.",
      }),
  })
}
