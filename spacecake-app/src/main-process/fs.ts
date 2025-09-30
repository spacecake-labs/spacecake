import path from "path"

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Data, Effect } from "effect"

// layer & runner
export const FsLive = NodeFileSystem.layer

export const run = <E, A>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem>
) => {
  return Effect.runPromise(Effect.provide(effect, FsLive))
}

// error
export class FsError extends Data.TaggedError("FsError")<{
  error: unknown
  message: string
}> {}

export const existsEffect = (
  filePath: string
): Effect.Effect<boolean, FsError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(filePath)).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error checking exists: ${filePath}` })
    )
  )

export const createFile = (
  filePath: string,
  content: string = ""
): Effect.Effect<void, FsError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.writeFile(filePath, new TextEncoder().encode(content))
  ).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error creating file: ${filePath}` })
    )
  )

export const createFolder = (
  folderPath: string
): Effect.Effect<void, FsError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.makeDirectory(folderPath, { recursive: true })
  ).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error creating folder: ${folderPath}` })
    )
  )

export const ensureSpacecakeFolder = (
  workspacePath: string
): Effect.Effect<void, FsError, FileSystem.FileSystem> => {
  const spacecakePath = path.join(workspacePath, ".spacecake")
  return createFolder(spacecakePath)
}

export const renameFile = (
  oldPath: string,
  newPath: string
): Effect.Effect<void, FsError, FileSystem.FileSystem> =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const exists = yield* _(fs.exists(newPath))
    if (exists) {
      return yield* _(
        Effect.fail(
          new FsError({
            error: "EEXIST",
            message: `file or directory already exists: ${newPath}`,
          })
        )
      )
    }
    return yield* _(fs.rename(oldPath, newPath))
  }).pipe(
    Effect.mapError(
      (error) =>
        new FsError({
          error,
          message: `error renaming file from ${oldPath} to ${newPath}`,
        })
    )
  )

export const deleteFile = (
  filePath: string
): Effect.Effect<void, FsError, FileSystem.FileSystem> =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const stats = yield* _(fs.stat(filePath))
    if (stats.type === "Directory") {
      return yield* _(fs.remove(filePath, { recursive: true }))
    } else {
      return yield* _(fs.remove(filePath))
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error deleting file: ${filePath}` })
    )
  )
