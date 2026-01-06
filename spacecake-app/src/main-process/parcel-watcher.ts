import * as Error from "@effect/platform/Error"
import * as FileSystem from "@effect/platform/FileSystem"
import * as ParcelWatcher from "@parcel/watcher"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"

import { WATCHER_IGNORE_PATTERNS } from "@/lib/ignore-patterns"

const makeBackend = Effect.sync(() => {
  const watchParcel = (path: string) =>
    Stream.unwrap(
      Effect.succeed(
        Stream.asyncScoped<FileSystem.WatchEvent, Error.PlatformError>((emit) =>
          Effect.acquireRelease(
            Effect.tryPromise({
              try: () =>
                ParcelWatcher.subscribe(
                  path,
                  (cause, events) => {
                    if (cause) {
                      emit.fail(
                        new Error.SystemError({
                          reason: "Unknown",
                          module: "FileSystem",
                          method: "watch",
                          pathOrDescriptor: path,
                          cause,
                        })
                      )
                    } else {
                      emit.chunk(
                        Chunk.unsafeFromArray(
                          events.map((event) => {
                            switch (event.type) {
                              case "create": {
                                return FileSystem.WatchEventCreate({
                                  path: event.path,
                                })
                              }
                              case "update": {
                                return FileSystem.WatchEventUpdate({
                                  path: event.path,
                                })
                              }
                              case "delete": {
                                return FileSystem.WatchEventRemove({
                                  path: event.path,
                                })
                              }
                            }
                          })
                        )
                      )
                    }
                  },
                  {
                    ignore: WATCHER_IGNORE_PATTERNS,
                  }
                ),
              catch: (cause) =>
                new Error.SystemError({
                  reason: "Unknown",
                  module: "FileSystem",
                  method: "watch",
                  pathOrDescriptor: path,
                  cause,
                }),
            }),
            (sub) => Effect.promise(() => sub.unsubscribe())
          )
        )
      )
    )

  return FileSystem.WatchBackend.of({
    register(path, stat, _options) {
      if (stat.type !== "Directory") {
        return Option.none()
      }
      return Option.some(watchParcel(path))
    },
  })
})

export const layer = Layer.effect(FileSystem.WatchBackend, makeBackend)
