import path from "path"

import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Data, Effect, Option } from "effect"
import writeFileAtomic from "write-file-atomic"

import type { FileContent } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  message: string
}> {}

export class FileSystem extends Effect.Service<FileSystem>()("app/FileSystem", {
  // define how to create the service
  effect: Effect.gen(function* () {
    const fs = yield* EffectFileSystem.FileSystem

    const readTextFile = (
      filePath: string
    ): Effect.Effect<FileContent, FileSystemError> =>
      Effect.gen(function* () {
        const name = path.basename(filePath)
        const content = yield* fs.readFileString(filePath, "utf8")
        const stat = yield* fs.stat(filePath)

        return {
          name,
          path: filePath,
          kind: "file" as const,
          etag: {
            mtimeMs: Option.getOrElse(
              Option.map(stat.mtime, (d) => d.getTime()),
              () => Date.now()
            ),
            size: Number(stat.size),
          },
          content,
          fileType: fileTypeFromFileName(name),
          cid: fnv1a64Hex(content),
        }
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to read file \`${filePath}\`: ${error.message}`,
            })
        )
      )
    const writeTextFile = (
      filePath: string,
      content: string
    ): Effect.Effect<void, FileSystemError> =>
      Effect.tryPromise({
        try: async () =>
          await writeFileAtomic(filePath, content, { encoding: "utf8" }),
        catch: (error) =>
          new FileSystemError({
            message: `failed to write file \`${filePath}\`: ${error}`,
          }),
      })

    const createFolder = (
      folderPath: string
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.makeDirectory(folderPath)
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to create folder \`${folderPath}\`: ${error}`,
            })
        )
      )

    const pathExists = (
      path: string
    ): Effect.Effect<boolean, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.exists(path)
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to check if path exists \`${path}\`: ${error}`,
            })
        )
      )

    return { readTextFile, writeTextFile, createFolder, pathExists } as const
  }),

  dependencies: [NodeFileSystem.layer],
}) {}
