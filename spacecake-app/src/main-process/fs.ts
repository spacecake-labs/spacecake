import path from "path"

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Data, Effect, Option } from "effect"
import writeFileAtomic from "write-file-atomic"

import type { FileContent } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"

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

// public effects
export const statEffect = (
  filePath: string
): Effect.Effect<FileSystem.File.Info, FsError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.stat(filePath)).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error stating file: ${filePath}` })
    )
  )

export const existsEffect = (
  filePath: string
): Effect.Effect<boolean, FsError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(filePath)).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `error checking exists: ${filePath}` })
    )
  )

export const readFile = (
  filePath: string
): Effect.Effect<FileContent, FsError, FileSystem.FileSystem> =>
  Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
    const [contentBuffer, stats] = yield* _(
      Effect.all([fs.readFile(filePath), fs.stat(filePath)])
    )
    const content = new TextDecoder().decode(contentBuffer)
    const name = path.basename(filePath)
    return {
      name,
      path: filePath,
      kind: "file" as const,
      etag: {
        mtimeMs: Option.getOrElse(
          Option.map(stats.mtime, (d) => d.getTime()),
          () => Date.now()
        ),
        size: Number(stats.size),
      },
      content,
      fileType: fileTypeFromFileName(name),
      cid: fnv1a64Hex(content),
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new FsError({ error, message: `Failed to read file ${filePath}` })
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

export const saveFileAtomic = (
  filePath: string,
  content: string
): Effect.Effect<void, FsError, FileSystem.FileSystem> =>
  Effect.tryPromise({
    try: async () =>
      await writeFileAtomic(filePath, content, { encoding: "utf8" }),
    catch: (error) =>
      new FsError({
        error,
        message: `error saving file atomically: ${filePath}`,
      }),
  })
