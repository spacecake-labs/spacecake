import type { PlatformError } from "@effect/platform/Error"

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, Fiber, Layer, Match, Option, Queue, Schedule, Stream } from "effect"
import { BrowserWindow } from "electron"
import path from "path"

import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"
import * as ParcelWatcher from "@/main-process/parcel-watcher"
import { AbsolutePath, ETag, FileTreeEvent } from "@/types/workspace"

/** Exported for testing */
export function convertToFileTreeEvent(
  fileEvent: FileSystem.WatchEvent,
  workspacePath: AbsolutePath,
): Effect.Effect<FileTreeEvent | null, never, FileSystem.FileSystem> {
  const { path: eventPath } = fileEvent

  const TEMP_FILE_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp|\.\d+$/ // Regex to filter out common temporary files and atomic write artifacts

  if (TEMP_FILE_RE.test(eventPath)) {
    return Effect.succeed(null)
  }

  if (!eventPath.startsWith(workspacePath)) {
    return Effect.succeed(null)
  }

  const match = Match.type<FileSystem.WatchEvent>().pipe(
    Match.tag("Create", (event) =>
      Effect.gen(function* (_) {
        const fs = yield* _(FileSystem.FileSystem)
        const stats = yield* _(fs.stat(event.path))

        if (stats.type === "Directory") {
          return {
            kind: "addFolder" as const,
            path: AbsolutePath(event.path),
          }
        } else {
          const etag: ETag = {
            mtime: Option.getOrElse(stats.mtime, () => new Date()),
            size: Number(stats.size),
          }
          return {
            kind: "addFile" as const,
            path: AbsolutePath(event.path),
            etag,
          }
        }
      }).pipe(
        // On error (file already deleted, etc.), skip the event
        Effect.catchAll(() => Effect.succeed(null)),
      ),
    ),
    Match.tag("Update", (event) =>
      Effect.gen(function* (_) {
        const fs = yield* _(FileSystem.FileSystem)

        // Stat first to check if it's a directory
        const stats = yield* _(fs.stat(event.path))

        // Skip directories - they don't have "content changes"
        if (stats.type === "Directory") {
          return null
        }

        const content = yield* _(fs.readFileString(event.path))
        const fileName = path.basename(event.path)
        const fileType = fileTypeFromFileName(fileName)
        const cid = fnv1a64Hex(content)
        const etag: ETag = {
          mtime: Option.getOrElse(stats.mtime, () => new Date()),
          size: Number(stats.size),
        }
        return {
          kind: "contentChange" as const,
          path: AbsolutePath(event.path),
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
    Match.tag("Remove", (event) => {
      const ext = path.extname(event.path)
      if (ext) {
        return Effect.succeed({
          kind: "unlinkFile" as const,
          path: AbsolutePath(event.path),
        })
      } else {
        return Effect.succeed({
          kind: "unlinkFolder" as const,
          path: AbsolutePath(event.path),
        })
      }
    }),
    Match.exhaustive,
  )

  return match(fileEvent)
}

// --- Watcher Service Definition ---

export type WatcherCommand =
  | { readonly _tag: "Start"; readonly path: AbsolutePath }
  | { readonly _tag: "Stop"; readonly path: AbsolutePath }
  | { readonly _tag: "StartFile"; readonly path: AbsolutePath; readonly channel: string }
  | { readonly _tag: "StopFile"; readonly path: AbsolutePath }

export const WatcherFileSystemLive = Layer.provide(NodeFileSystem.layer, ParcelWatcher.layer)

export class WatcherService extends Effect.Service<WatcherService>()("app/WatcherService", {
  dependencies: [WatcherFileSystemLive],
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const commandQueue = yield* Queue.unbounded<WatcherCommand>()
    const runningWatchers = new Map<AbsolutePath, Fiber.RuntimeFiber<void, PlatformError>>()
    const fileWatchers = new Map<AbsolutePath, Fiber.RuntimeFiber<void, PlatformError>>()

    yield* Effect.log("watcher service started")

    const processCommands = Queue.take(commandQueue).pipe(
      Effect.flatMap((command) =>
        Match.value(command).pipe(
          Match.when({ _tag: "Start" }, ({ path: watchPath }) =>
            Effect.gen(function* () {
              if (runningWatchers.has(watchPath)) {
                return yield* Effect.log(`watcher for ${watchPath} already running`)
              }

              yield* Effect.log(`starting watcher for ${watchPath}`)

              // Retry schedule: exponential backoff starting at 1s, with jitter,
              // capped at 30s between retries. Retries forever.
              const retrySchedule = Schedule.exponential("1 second").pipe(
                Schedule.jittered,
                Schedule.union(Schedule.spaced("30 seconds")),
              )

              const watchStream = fs.watch(watchPath, { recursive: true }).pipe(
                Stream.runForEach((fileEvent) =>
                  convertToFileTreeEvent(fileEvent, watchPath).pipe(
                    Effect.flatMap((fileTreeEvent) =>
                      fileTreeEvent
                        ? Effect.sync(() => {
                            BrowserWindow.getAllWindows().forEach((win) =>
                              win.webContents.send("file-event", fileTreeEvent),
                            )
                          })
                        : Effect.void,
                    ),
                  ),
                ),
                Effect.tapError((e) =>
                  Effect.log(`watcher for ${watchPath} encountered error, will retry`, e),
                ),
                Effect.retry(retrySchedule),
              )

              const fiber = yield* Effect.fork(watchStream)
              runningWatchers.set(watchPath, fiber)
            }),
          ),
          Match.when({ _tag: "Stop" }, ({ path: watchPath }) =>
            Effect.gen(function* () {
              const fiber = runningWatchers.get(watchPath)
              if (!fiber) {
                return yield* Effect.log(`no watcher found for ${watchPath} to stop.`)
              }
              yield* Effect.log(`stopping watcher for ${watchPath}`)
              yield* Fiber.interrupt(fiber)
              runningWatchers.delete(watchPath)
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
        for (const [, fiber] of runningWatchers) {
          yield* Fiber.interrupt(fiber)
        }
        for (const [, fiber] of fileWatchers) {
          yield* Fiber.interrupt(fiber)
        }
        runningWatchers.clear()
        fileWatchers.clear()
      }),
    )

    // Public interface
    const start = (watchPath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "Start", path: watchPath })

    const stop = (watchPath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "Stop", path: watchPath })

    const startFile = (filePath: AbsolutePath, channel: string) =>
      Queue.offer(commandQueue, { _tag: "StartFile", path: filePath, channel })

    const stopFile = (filePath: AbsolutePath) =>
      Queue.offer(commandQueue, { _tag: "StopFile", path: filePath })

    return { start, stop, startFile, stopFile } as const
  }),
}) {}
