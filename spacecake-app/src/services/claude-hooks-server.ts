import type { AddressInfo } from "node:net"

import { Effect } from "effect"
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http"
import path from "node:path"

import type { DisplayStatusline } from "@/lib/statusline-parser"

import { parseStatuslineInput } from "@/lib/statusline-parser"
import { ClaudeConfig } from "@/services/claude-config"
import { FileSystem } from "@/services/file-system"
import { StatuslineInput } from "@/types/statusline"
import { AbsolutePath } from "@/types/workspace"

const isWindows = process.platform === "win32"

// Statusline service to manage subscribers and state
export class StatuslineService extends Effect.Service<StatuslineService>()("StatuslineService", {
  effect: Effect.sync(() => {
    let lastStatusline: DisplayStatusline | null = null
    const updateCallbacks: Set<(data: DisplayStatusline) => void> = new Set()
    const clearCallbacks: Set<() => void> = new Set()

    return {
      processStatusline: (input: StatuslineInput) => {
        const statuslineData = parseStatuslineInput(input)
        lastStatusline = statuslineData
        updateCallbacks.forEach((callback) => {
          try {
            callback(statuslineData)
          } catch (err) {
            console.error("Statusline Service: callback error", err)
          }
        })
        return statuslineData
      },
      clearStatusline: () => {
        lastStatusline = null
        clearCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (err) {
            console.error("Statusline Service: clear callback error", err)
          }
        })
      },
      getLastStatusline: () => lastStatusline,
      onStatuslineUpdate: (callback: (data: DisplayStatusline) => void) => {
        updateCallbacks.add(callback)
        return () => {
          updateCallbacks.delete(callback)
        }
      },
      onStatuslineCleared: (callback: () => void) => {
        clearCallbacks.add(callback)
        return () => {
          clearCallbacks.delete(callback)
        }
      },
    }
  }),
}) {}

const respondJson = (res: ServerResponse, statusCode: number, data: unknown) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

interface StatuslineServiceInstance {
  processStatusline: (input: StatuslineInput) => DisplayStatusline
  clearStatusline: () => void
  getLastStatusline: () => DisplayStatusline | null
  onStatuslineUpdate: (callback: (data: DisplayStatusline) => void) => () => void
  onStatuslineCleared: (callback: () => void) => () => void
}

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  service: StatuslineServiceInstance,
) => {
  try {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "localhost")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    // Handle OPTIONS
    if (req.method === "OPTIONS") {
      res.writeHead(200)
      res.end()
      return
    }

    // Handle POST /statusline
    if (req.method === "POST" && req.url === "/statusline") {
      let body = ""

      req.on("data", (chunk) => {
        body += chunk.toString()
      })

      req.on("end", () => {
        try {
          const parsed = JSON.parse(body) as unknown

          // Validate basic structure
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("model" in parsed) ||
            !("context_window" in parsed) ||
            !("cost" in parsed)
          ) {
            respondJson(res, 400, { error: "Invalid statusline data" })
            return
          }

          const input = parsed as StatuslineInput
          service.processStatusline(input)
          respondJson(res, 200, { success: true })
        } catch (err) {
          console.error("Statusline Server: failed to parse JSON", err)
          respondJson(res, 400, { error: "Failed to parse JSON" })
        }
      })

      return
    }

    // Handle health check
    if (req.method === "GET" && req.url === "/health") {
      respondJson(res, 200, { status: "ok" })
      return
    }

    // 404 for other routes
    respondJson(res, 404, { error: "Not found" })
  } catch (err) {
    console.error("Statusline Server: unexpected error", err)
    respondJson(res, 500, { error: "Internal server error" })
  }
}

const startServerEffect = (socketPath: string, service: StatuslineServiceInstance) =>
  Effect.async<Server, Error>((resume) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, service).catch((err) => {
        console.error("Claude Hooks Server: unhandled request error", err)
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

const startServerTcpEffect = (service: StatuslineServiceInstance) =>
  Effect.async<Server, Error>((resume) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, service).catch((err) => {
        console.error("Claude Hooks Server: unhandled request error", err)
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
    server.listen(0, "127.0.0.1")

    return Effect.sync(() => {
      server.close()
    })
  })

export interface ClaudeHooksServerService {
  readonly ensureStarted: () => Promise<string>
  readonly isStarted: () => boolean
  readonly getLastStatusline: () => DisplayStatusline | null
  readonly onStatuslineUpdate: (callback: (data: DisplayStatusline) => void) => () => void
  readonly onStatuslineCleared: (callback: () => void) => () => void
}

export const makeClaudeHooksServer = Effect.gen(function* () {
  const claudeConfig = yield* ClaudeConfig
  const fsService = yield* FileSystem
  const statuslineService = yield* StatuslineService

  let serverState: {
    server: Server
    socketPath: string | null
    portFilePath: string | null
  } | null = null

  let startPromise: Promise<string> | null = null

  const doStart = Effect.gen(function* () {
    yield* fsService.createFolder(claudeConfig.configDir, { recursive: true })

    let server: Server
    let listenAddress: string

    if (isWindows) {
      // windows — listen on localhost TCP port (random)
      server = yield* startServerTcpEffect(statuslineService)
      const port = (server.address() as AddressInfo).port
      const portFilePath = path.join(claudeConfig.configDir, "spacecake.port")
      yield* fsService.writeTextFile(AbsolutePath(portFilePath), String(port))

      // clear statusline if the server crashes or closes unexpectedly
      server.on("error", (err) => {
        console.error("Claude Hooks Server: server error", err)
        statuslineService.clearStatusline()
        serverState = null
      })
      server.on("close", () => {
        statuslineService.clearStatusline()
        serverState = null
      })

      serverState = { server, socketPath: null, portFilePath }
      listenAddress = `tcp://127.0.0.1:${port}`
    } else {
      // unix — existing unix socket logic
      const { socketPath } = claudeConfig

      // clean up any existing socket file (ignore if doesn't exist)
      const socketExists = yield* fsService
        .exists(socketPath)
        .pipe(Effect.catchAll(() => Effect.succeed(false)))
      if (socketExists) {
        yield* fsService.remove(socketPath).pipe(Effect.catchAll(() => Effect.void))
      }

      server = yield* startServerEffect(socketPath, statuslineService)

      // clear statusline if the server crashes or closes unexpectedly
      server.on("error", (err) => {
        console.error("Claude Hooks Server: server error", err)
        statuslineService.clearStatusline()
        serverState = null
      })
      server.on("close", () => {
        statuslineService.clearStatusline()
        serverState = null
      })

      serverState = { server, socketPath, portFilePath: null }
      listenAddress = socketPath
    }

    return listenAddress
  })

  const ensureStarted = async (): Promise<string> => {
    if (serverState) {
      if (serverState.socketPath) return serverState.socketPath
      if (serverState.portFilePath) {
        const port = (serverState.server.address() as AddressInfo).port
        return `tcp://127.0.0.1:${port}`
      }
    }
    if (!startPromise) {
      startPromise = Effect.runPromise(doStart)
    }
    return startPromise
  }

  const isStarted = () => serverState !== null

  const getLastStatusline = () => statuslineService.getLastStatusline()

  const onStatuslineUpdate = (callback: (data: DisplayStatusline) => void) => {
    return statuslineService.onStatuslineUpdate(callback)
  }

  const onStatuslineCleared = (callback: () => void) => {
    return statuslineService.onStatuslineCleared(callback)
  }

  // finalizer to clean up on shutdown
  yield* Effect.addFinalizer(() => {
    if (!serverState) {
      return Effect.void
    }
    const { server, socketPath, portFilePath } = serverState
    return Effect.async<void, never>((resume) => {
      server.close(() => resume(Effect.void))
    }).pipe(
      Effect.andThen(
        socketPath
          ? fsService.remove(socketPath)
          : portFilePath
            ? fsService.remove(portFilePath)
            : Effect.void,
      ),
      Effect.catchAll(() => Effect.void),
    )
  })

  return {
    ensureStarted,
    isStarted,
    getLastStatusline,
    onStatuslineUpdate,
    onStatuslineCleared,
  } as const
})

export class ClaudeHooksServer extends Effect.Service<ClaudeHooksServer>()("ClaudeHooksServer", {
  scoped: makeClaudeHooksServer,
  dependencies: [ClaudeConfig.Default, FileSystem.Default, StatuslineService.Default],
}) {}
