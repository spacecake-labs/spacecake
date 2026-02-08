import { Effect } from "effect"
import { BrowserWindow, ipcMain } from "electron"
/**
 * CLI Server — IPC server for the `spacecake` CLI tool.
 *
 * Listens on ~/.spacecake/.app/cli.sock (Unix) or named pipe (Windows) and handles:
 *   POST /open  — open files in the editor
 *   GET /health — health check
 *
 * When `wait: true`, holds the HTTP connection open until the file tab is
 * closed (signalled via IPC from the renderer).
 */
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http"
import path from "node:path"

import type { OpenFilePayload } from "@/types/claude-code"

import { toIpcPath } from "@/lib/ipc-path"
import { normalizePath } from "@/lib/utils"
import { FileSystem } from "@/services/file-system"
import { SpacecakeHome } from "@/services/spacecake-home"

// --- Types ---

interface OpenFileRequest {
  files: Array<{
    path: string
    line?: number
    col?: number
  }>
  wait?: boolean
}

// --- Broadcast helper ---

function broadcastOpenFile(payload: OpenFilePayload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("claude:open-file", payload)
  })
}

// --- HTTP helpers ---

const respondJson = (res: ServerResponse, statusCode: number, data: unknown) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

// --- Pending wait connections ---

// Map of absolute file path → list of pending ServerResponse objects
// When a file is closed, we resolve these
const pendingWaits = new Map<string, ServerResponse[]>()

function resolveWaiters(filePath: string) {
  const waiters = pendingWaits.get(filePath)
  if (waiters) {
    for (const res of waiters) {
      respondJson(res, 200, { closed: true })
    }
    pendingWaits.delete(filePath)
  }
}

// --- Request handler ---

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  workspaceFolders: string[],
) {
  try {
    // POST /open
    if (req.method === "POST" && req.url === "/open") {
      const body = await readBody(req)
      let parsed: OpenFileRequest
      try {
        parsed = JSON.parse(body) as OpenFileRequest
      } catch {
        respondJson(res, 400, { error: "Invalid JSON" })
        return
      }

      if (!parsed.files || !Array.isArray(parsed.files)) {
        respondJson(res, 400, { error: "Missing 'files' array" })
        return
      }

      // Determine workspace for each file
      // Normalize workspace folders for consistent path comparison
      const normalizedFolders = workspaceFolders.map(normalizePath)
      const primaryWorkspace = normalizedFolders[0]
      if (!primaryWorkspace) {
        respondJson(res, 503, { error: "No workspace open" })
        return
      }

      for (const file of parsed.files) {
        const absPath = normalizePath(path.resolve(file.path))
        const matchingWorkspace =
          normalizedFolders.find((folder) => absPath.startsWith(folder)) ?? primaryWorkspace

        broadcastOpenFile({
          workspacePath: matchingWorkspace,
          filePath: absPath,
          line: file.line,
          col: file.col,
          source: "cli",
        })

        // If wait mode, register the response for this file
        if (parsed.wait) {
          const existing = pendingWaits.get(absPath) ?? []
          existing.push(res)
          pendingWaits.set(absPath, existing)
        }
      }

      // If not waiting, respond immediately
      if (!parsed.wait) {
        respondJson(res, 200, { opened: parsed.files.length })
      }
      // If waiting, the response will be sent when the file is closed

      return
    }

    // GET /health
    if (req.method === "GET" && req.url === "/health") {
      respondJson(res, 200, { status: "ok" })
      return
    }

    respondJson(res, 404, { error: "Not found" })
  } catch (err) {
    console.error("CLI Server: unexpected error", err)
    respondJson(res, 500, { error: "Internal server error" })
  }
}

// --- Server start effect ---

const startServerEffect = (socketPath: string, getWorkspaceFolders: () => string[]) =>
  Effect.async<Server, Error>((resume) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, getWorkspaceFolders()).catch((err) => {
        console.error("CLI Server: unhandled request error", err)
        respondJson(res, 500, { error: "Internal server error" })
      })
    })

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
    server.listen(socketPath)

    // Cleanup on cancellation
    return Effect.sync(() => {
      server.close()
    })
  })

// --- Effect service ---

export const makeCliServer = Effect.gen(function* () {
  const fsService = yield* FileSystem
  const home = yield* SpacecakeHome

  let serverState: {
    socketPath: string
    server: Server
    workspaceFolders: string[]
  } | null = null

  let startPromise: Promise<void> | null = null

  // Listen for file-closed IPC from renderer (for --wait support)
  ipcMain.handle("cli:file-closed", (_, filePath: string) => {
    resolveWaiters(filePath)
  })

  // Allow updating workspace folders (called when Claude Code server starts)
  ipcMain.handle("cli:update-workspaces", (_, workspaceFolders: string[]) => {
    if (serverState) {
      serverState.workspaceFolders = workspaceFolders
    }
  })

  const doStart = (workspaceFolders: string[]) =>
    Effect.gen(function* () {
      const appDir = home.appDir
      yield* fsService.createFolder(appDir, { recursive: true })

      const socketPath = toIpcPath(path.join(appDir, "cli.sock"))

      // Clean up any existing socket file (ignore if doesn't exist)
      const socketExists = yield* fsService
        .exists(socketPath)
        .pipe(Effect.catchAll(() => Effect.succeed(false)))
      if (socketExists) {
        yield* fsService.remove(socketPath).pipe(Effect.catchAll(() => Effect.void))
      }

      // Start the server (waits until it's listening)
      const server = yield* startServerEffect(
        socketPath,
        () => serverState?.workspaceFolders ?? workspaceFolders,
      )

      serverState = { socketPath, server, workspaceFolders }
    })

  const ensureStarted = async (workspaceFolders: string[]): Promise<void> => {
    if (serverState) {
      // Update workspace folders if server is already running
      serverState.workspaceFolders = workspaceFolders
      return
    }
    if (!startPromise) {
      startPromise = Effect.runPromise(doStart(workspaceFolders))
    }
    return startPromise
  }

  const isStarted = () => serverState !== null

  // Finalizer: close server and remove socket
  yield* Effect.addFinalizer(() => {
    if (!serverState) {
      return Effect.void
    }
    const { server, socketPath } = serverState
    // Resolve any pending waiters before closing
    for (const [, waiters] of pendingWaits) {
      for (const res of waiters) {
        try {
          respondJson(res, 503, { closed: true, reason: "server_shutdown" })
        } catch {
          // client may have disconnected
        }
      }
    }
    pendingWaits.clear()
    return Effect.gen(function* () {
      yield* Effect.async<void, never>((resume) => {
        server.close(() => resume(Effect.void))
      })
      yield* fsService.remove(socketPath)
      yield* Effect.log("CLI Server: stopped")
    }).pipe(Effect.catchAll(() => Effect.void))
  })

  return { ensureStarted, isStarted } as const
})

export class CliServer extends Effect.Service<CliServer>()("CliServer", {
  scoped: makeCliServer,
  dependencies: [FileSystem.Default],
}) {}
