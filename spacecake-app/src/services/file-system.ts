import path from "path"

import { commandQueue } from "@/main-process/watcher"
import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Data, Effect, Option } from "effect"
import writeFileAtomic from "write-file-atomic"

import type { File, FileContent, FileTree, Folder } from "@/types/workspace"
import { ZERO_HASH } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"

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

    const remove = (path: string, recursive?: boolean) =>
      Effect.gen(function* (_) {
        return yield* fs.remove(path, { recursive: recursive })
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `error deleting file \`${path}\`: ${error}`,
            })
        )
      )

    const rename = (
      path: string,
      newPath: string
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.rename(path, newPath)
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to rename path \`${path}\`: ${error}`,
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

    const readDirectory = (
      workspacePath: string,
      currentPath: string = workspacePath
    ): Effect.Effect<FileTree, Error> => {
      return Effect.gen(function* (_) {
        const entries = yield* _(fs.readDirectory(currentPath))
        const tree: FileTree = []

        for (const entryName of entries) {
          const fullPath = path.join(currentPath, entryName)
          const relativePath = path.relative(workspacePath, fullPath)

          if (relativePath.startsWith(".") || relativePath.includes("/.")) {
            continue
          }

          const stats = yield* _(fs.stat(fullPath))

          if (stats.type === "Directory") {
            const children = yield* _(readDirectory(workspacePath, fullPath))
            const folder: Folder = {
              name: entryName,
              path: fullPath,
              children,
              kind: "folder",
              cid: ZERO_HASH,
              isExpanded: false,
            }
            tree.push(folder)
          } else if (stats.type === "File") {
            const file: File = {
              name: entryName,
              path: fullPath,
              fileType: fileTypeFromExtension(path.extname(entryName)),
              kind: "file",
              cid: ZERO_HASH, // Initial scan, no content read yet
              etag: {
                mtimeMs: Option.getOrElse(
                  Option.map(stats.mtime, (d) => d.getTime()),
                  () => Date.now()
                ),
                size: Number(stats.size),
              },
            }
            tree.push(file)
          }
        }
        return tree
      })
    }

    const startWatcher = (path: string) =>
      Effect.gen(function* (_) {
        return yield* _(commandQueue.offer({ _tag: "Start", path: path }))
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to watch path \`${path}\`: ${error}`,
            })
        )
      )

    const stopWatcher = (path: string) =>
      Effect.gen(function* (_) {
        return yield* _(commandQueue.offer({ _tag: "Stop", path: path }))
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to stop watcher \`${path}\`: ${error}`,
            })
        )
      )

    return {
      readTextFile,
      writeTextFile,
      createFolder,
      remove,
      rename,
      pathExists,
      readDirectory,
      startWatcher,
      stopWatcher,
    } as const
  }),

  dependencies: [NodeFileSystem.layer],
}) {}
