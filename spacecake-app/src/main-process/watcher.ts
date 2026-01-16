import path from "path"

import { FileSystem } from "@effect/platform"
import type { PlatformError } from "@effect/platform/Error"
import { Effect, Fiber, Match, Option, Queue, Stream } from "effect"
import { BrowserWindow } from "electron"

import { AbsolutePath, ETag, FileTreeEvent } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"

function convertToFileTreeEvent(
  fileEvent: FileSystem.WatchEvent,
  workspacePath: AbsolutePath
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
    Match.tag("Create", (event) => {
      const ext = path.extname(event.path)
      if (ext) {
        const etag: ETag = { mtime: new Date(), size: 0 }
        return Effect.succeed({
          kind: "addFile" as const,
          path: AbsolutePath(event.path),
          etag,
        })
      } else {
        return Effect.succeed({
          kind: "addFolder" as const,
          path: AbsolutePath(event.path),
        })
      }
    }),
    Match.tag("Update", (event) =>
      Effect.gen(function* (_) {
        const fs = yield* _(FileSystem.FileSystem)
        const content = yield* _(fs.readFileString(event.path))
        const fileName = path.basename(event.path)
        const fileType = fileTypeFromFileName(fileName)
        const cid = fnv1a64Hex(content)
        const stats = yield* _(fs.stat(event.path))
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
        Effect.catchAll(() => {
          const etag: ETag = { mtime: new Date(Date.now()), size: 0 }
          return Effect.succeed({
            kind: "addFile" as const,
            path: AbsolutePath(event.path),
            etag,
          })
        })
      )
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
    Match.exhaustive
  )

  return match(fileEvent)
}

// --- Watcher Service Definition ---

export type WatcherCommand =
  | { readonly _tag: "Start"; readonly path: AbsolutePath }
  | { readonly _tag: "Stop"; readonly path: AbsolutePath }

export const commandQueue = Effect.runSync(Queue.unbounded<WatcherCommand>())

export const watcherService = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem.FileSystem)
  const runningWatchers = new Map<
    AbsolutePath,
    Fiber.RuntimeFiber<void, PlatformError>
  >()

  yield* _(Effect.log("watcher service started"))

  const processCommands = Queue.take(commandQueue).pipe(
    Effect.flatMap((command) =>
      Match.value(command).pipe(
        Match.when({ _tag: "Start" }, ({ path }) =>
          Effect.gen(function* (_) {
            if (runningWatchers.has(path)) {
              return yield* _(Effect.log(`watcher for ${path} already running`))
            }

            yield* _(Effect.log(`starting watcher for ${path}`))

            const watchStream = fs.watch(path, { recursive: true }).pipe(
              Stream.runForEach((fileEvent) =>
                convertToFileTreeEvent(fileEvent, path).pipe(
                  Effect.flatMap((fileTreeEvent) =>
                    fileTreeEvent
                      ? Effect.sync(() => {
                          BrowserWindow.getAllWindows().forEach((win) =>
                            win.webContents.send("file-event", fileTreeEvent)
                          )
                        })
                      : Effect.void
                  )
                )
              )
            )

            const fiber = yield* _(Effect.fork(watchStream))
            runningWatchers.set(path, fiber)
          })
        ),
        Match.when({ _tag: "Stop" }, ({ path }) =>
          Effect.gen(function* (_) {
            const fiber = runningWatchers.get(path)
            if (!fiber) {
              return yield* _(
                Effect.log(`no watcher found for ${path} to stop.`)
              )
            }
            yield* _(Effect.log(`stopping watcher for ${path}`))
            yield* _(Fiber.interrupt(fiber))
            runningWatchers.delete(path)
          })
        ),
        Match.exhaustive
      )
    ),
    Effect.forever
  )

  yield* _(processCommands)
}).pipe(Effect.tapError((e) => Effect.logError("watcher service failed", e)))
