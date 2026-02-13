import type { PlatformError } from "@effect/platform/Error"

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, Fiber, Layer, Match, Option, Queue, Schedule, Stream } from "effect"
import { BrowserWindow } from "electron"
import path from "path"

import { fnv1a64Hex } from "@/lib/hash"
import { normalizePath } from "@/lib/utils"
import { fileTypeFromFileName } from "@/lib/workspace"
import * as ParcelWatcher from "@/main-process/parcel-watcher"
import { AbsolutePath, ETag, FileTreeEvent } from "@/types/workspace"

/** Exported for testing */
export function convertToFileTreeEvent(
  fileEvent: FileSystem.WatchEvent,
  workspacePath: AbsolutePath,
): Effect.Effect<FileTreeEvent | null, never, FileSystem.FileSystem> {
  // Normalize both paths to forward slashes for cross-platform consistency
  const eventPath = normalizePath(fileEvent.path)
  const normalizedWorkspacePath = normalizePath(workspacePath)

  const TEMP_FILE_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp|\.\d+$/ // Regex to filter out common temporary files and atomic write artifacts

  if (TEMP_FILE_RE.test(eventPath)) {
    return Effect.succeed(null)
  }

  if (!eventPath.startsWith(normalizedWorkspacePath)) {
    console.log("[watcher] path mismatch - event:", eventPath, "workspace:", normalizedWorkspacePath)
    return Effect.succeed(null)
  }

  const match = Match.type<FileSystem.WatchEvent>().pipe(
    Match.tag("Create", () =>
      Effect.gen(function* (_) {
        const fs = yield* _(FileSystem.FileSystem)
        const stats = yield* _(fs.stat(eventPath))

        if (stats.type === "Directory") {
          return {
            kind: "addFolder" as const,
            path: AbsolutePath(eventPath),
          }
        } else {
          const etag: ETag = {
            mtime: Option.getOrElse(stats.mtime, () => new Date()),
            size: Number(stats.size),
          }
          return {
            kind: "addFile" as const,
            path: AbsolutePath(eventPath),
            etag,
          }
        }
      }).pipe(
        // On error (file already deleted, etc.), skip the event
        Effect.catchAll(() => Effect.succeed(null)),
      ),
    ),
    Match.tag("Update", () =>
      Effect.gen(function* (_) {
        const fs = yield* _(FileSystem.FileSystem)

        // Stat first to check if it's a directory
        const stats = yield* _(fs.stat(eventPath))

        // Skip directories - they don't have "content changes"
        if (stats.type === "Directory") {
          return null
        }

        const content = yield* _(fs.readFileString(eventPath))
        const fileName = path.basename(eventPath)
        const fileType = fileTypeFromFileName(fileName)
        const cid = fnv1a64Hex(content)
        const etag: ETag = {
          mtime: Option.getOrElse(stats.mtime, () => new Date()),
          size: Number(stats.size),
        }
        return {
          kind: "contentChange" as const,
          path: AbsolutePath(eventPath),
          etag,
          content,
          fileType,
          cid,
        }
      }).pipe(
        // On any error (file deleted, permission denied, etc.), skip the event
        Effect.catchAll(() => Effect.succeed(null)),
      ),
    ),
    Match.tag("Remove", () => {
      const ext = path.extname(eventPath)
      if (ext) {
        return Effect.succeed({
          kind: "unlinkFile" as const,
          path: AbsolutePath(eventPath),
        })
      } else {
        return Effect.succeed({
          kind: "unlinkFolder" as const,
          path: AbsolutePath(eventPath),
        })
      }
    }),
    Match.exhaustive,
  )

  return match(fileEvent)
}

// --- Watcher Service Definition ---

export type WatcherCommand =
  | { readonly _tag: "StartWorkspace"; readonly path: AbsolutePath }
  | { readonly _tag: "StopWorkspace"; readonly path: AbsolutePath }
  | { readonly _tag: "StartFile"; readonly path: AbsolutePath; readonly channel: string }
  | { readonly _tag: "StopFile"; readonly path: AbsolutePath }
  | {
      readonly _tag: "StartDir"
      readonly path: AbsolutePath
      readonly channel: string
      readonly filter?: (path: string) => boolean
    }
  | { readonly _tag: "StopDir"; readonly path: AbsolutePath }

export const WatcherFileSystemLive = Layer.provide(NodeFileSystem.layer, ParcelWatcher.layer)

export class WatcherService extends Effect.Service<WatcherService>()("app/WatcherService", {
  dependencies: [WatcherFileSystemLive],
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const commandQueue = yield* Queue.unbounded<WatcherCommand>()
    const workspaceWatchers = new Map<AbsolutePath, Fiber.RuntimeFiber<void, PlatformError>>()
    const fileWatchers = new Map<AbsolutePath, Fiber.RuntimeFiber<void, PlatformError>>()
    const dirWatchers = new Map<AbsolutePath, Fiber.RuntimeFiber<void, PlatformError>>()

    yield* Effect.log("watcher service started")

    const processCommands = Queue.take(commandQueue).pipe(
      Effect.flatMap((command) =>
        Match.value(command).pipe(
          Match.when({ _tag: "StartWorkspace" }, ({ path: watchPath }) =>
            Effect.gen(function* () {
              if (workspaceWatchers.has(watchPath)) {
                return yield* Effect.log(`workspace watcher for ${watchPath} already running`)
              }

              yield* Effect.log(`starting workspace watcher for ${watchPath}`)

              // Retry schedule: exponential backoff starting at 1s, with jitter,
              // capped at 30s between retries. Retries forever.
              const retrySchedule = Schedule.exponential("1 second").pipe(
                Schedule.jittered,
                Schedule.union(Schedule.spaced("30 seconds")),
              )

              const watchStream = fs.watch(watchPath, { recursive: true }).pipe(
                Stream.runForEach((fileEvent) =>
                  Effect.gen(function* () {
                    const fileTreeEvent = yield* convertToFileTreeEvent(fileEvent, watchPath)
                    if (fileTreeEvent) {
                      BrowserWindow.getAllWindows().forEach((win) =>
                        win.webContents.send("file-event", fileTreeEvent),
                      )
                    }
                  }),
                ),
                Effect.tapError((e) =>
                  Effect.log(`workspace watcher for ${watchPath} encountered error, will retry`, e),
                ),
                Effect.retry(retrySchedule),
              )

              const fiber = yield* Effect.fork(watchStream)
              workspaceWatchers.set(watchPath, fiber)
            }),
          ),
          Match.when({ _tag: "StopWorkspace" }, ({ path: watchPath }) =>
            Effect.gen(function* () {
              const fiber = workspaceWatchers.get(watchPath)
              if (!fiber) {
                return yield* Effect.log(`no workspace watcher found for ${watchPath}`)
              }
              yield* Effect.log(`stopping workspace watcher for ${watchPath}`)
              yield* Fiber.interrupt(fiber)
              workspaceWatchers.delete(watchPath)
            }),
          ),
          Match.when({ _tag: "StartFile" }, ({ path: filePath, channel }) =>
            Effect.gen(function* () {
              if (fileWatchers.has(filePath)) {
                return yield* Effect.log(`file watcher already running for ${filePath}`)
              }
              yield* Effect.log(`starting file watcher for ${filePath}`)

              const retrySchedule = Schedule.exponential("1 second").pipe(
                Schedule.jittered,
                Schedule.union(Schedule.spaced("30 seconds")),
              )

              const watchStream = fs.watch(filePath).pipe(
                Stream.debounce("200 millis"),
                Stream.runForEach(() =>
                  Effect.sync(() => {
                    BrowserWindow.getAllWindows().forEach((win) =>
                      win.webContents.send(channel, { path: filePath }),
                    )
                  }),
                ),
                Effect.tapError((e) => Effect.log(`file watcher error for ${filePath}`, e)),
                Effect.retry(retrySchedule),
              )

              const fiber = yield* Effect.fork(watchStream)
              fileWatchers.set(filePath, fiber)
            }),
          ),
          Match.when({ _tag: "StopFile" }, ({ path: filePath }) =>
            Effect.gen(function* () {
              const fiber = fileWatchers.get(filePath)
              if (!fiber) {
                return yield* Effect.log(`no file watcher for ${filePath}`)
              }
              yield* Effect.log(`stopping file watcher for ${filePath}`)
              yield* Fiber.interrupt(fiber)
              fileWatchers.delete(filePath)
            }),
          ),
          Match.when({ _tag: "StartDir" }, ({ path: dirPath, channel, filter }) =>
            Effect.gen(function* () {
              if (dirWatchers.has(dirPath)) {
                return yield* Effect.log(`dir watcher already running for ${dirPath}`)
              }
              yield* Effect.log(`starting dir watcher for ${dirPath} on channel ${channel}`)

              const retrySchedule = Schedule.exponential("1 second").pipe(
                Schedule.jittered,
                Schedule.union(Schedule.spaced("30 seconds")),
              )

              const watchStream = fs.watch(dirPath, { recursive: true }).pipe(
                Stream.filter((event) => (filter ? filter(normalizePath(event.path)) : true)),
                Stream.debounce("200 millis"),
                Stream.runForEach((event) =>
                  Effect.sync(() => {
                    const normalizedPath = normalizePath(event.path)
                    BrowserWindow.getAllWindows().forEach((win) =>
                      win.webContents.send(channel, { path: normalizedPath }),
                    )
                  }),
                ),
                Effect.tapError((e) => Effect.log(`dir watcher error for ${dirPath}`, e)),
                Effect.retry(retrySchedule),
              )

              const fiber = yield* Effect.fork(watchStream)
              dirWatchers.set(dirPath, fiber)
            }),
          ),
          Match.when({ _tag: "StopDir" }, ({ path: dirPath }) =>
            Effect.gen(function* () {
              const fiber = dirWatchers.get(dirPath)
              if (!fiber) {
                return yield* Effect.log(`no dir watcher for ${dirPath}`)
              }
              yield* Effect.log(`stopping dir watcher for ${dirPath}`)
              yield* Fiber.interrupt(fiber)
              dirWatchers.delete(dirPath)
            }),
          ),
          Match.exhaustive,
        ),
      ),
      Effect.forever,
    )

    // Fork scoped — fiber is interrupted when scope closes
    yield* Effect.forkScoped(processCommands)

    // Finalizer — shut down queue (interrupts Queue.take) and stop all watchers
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.log("watcher service shutting down")
        yield* Queue.shutdown(commandQueue)
        for (const [, fiber] of workspaceWatchers) {
          yield* Fiber.interrupt(fiber)
        }
        for (const [, fiber] of fileWatchers) {
          yield* Fiber.interrupt(fiber)
        }
        for (const [, fiber] of dirWatchers) {
          yield* Fiber.interrupt(fiber)
        }
        workspaceWatchers.clear()
        fileWatchers.clear()
        dirWatchers.clear()
      }),
    )

    // Public interface
    const startWorkspace = (watchPath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "StartWorkspace", path: watchPath })

    const stopWorkspace = (watchPath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "StopWorkspace", path: watchPath })

    const startFile = (filePath: AbsolutePath, channel: string) =>
      Queue.offer(commandQueue, { _tag: "StartFile", path: filePath, channel })

    const stopFile = (filePath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "StopFile", path: filePath })

    const startDir = (dirPath: AbsolutePath, channel: string, filter?: (path: string) => boolean) =>
      Queue.offer(commandQueue, { _tag: "StartDir", path: dirPath, channel, filter })

    const stopDir = (dirPath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "StopDir", path: dirPath })

    return { startWorkspace, stopWorkspace, startFile, stopFile, startDir, stopDir } as const
  }),
}) {}
