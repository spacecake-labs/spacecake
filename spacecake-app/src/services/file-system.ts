import path from "path"

import { commandQueue } from "@/main-process/watcher"
import { GitIgnore, GitIgnoreLive } from "@/services/git-ignore-parser"
import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Data, Effect, Either, Option } from "effect"
import writeFileAtomic from "write-file-atomic"

import type { File, FileContent, FileTree, Folder } from "@/types/workspace"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  message: string
}> {}

export class FileSystem extends Effect.Service<FileSystem>()("app/FileSystem", {
  // define how to create the service
  effect: Effect.gen(function* () {
    const fs = yield* EffectFileSystem.FileSystem
    const gitIgnore = yield* GitIgnore

    const readTextFile = (
      filePath: AbsolutePath
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
            mtime: Option.getOrElse(stat.mtime, () => new Date()),
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
      filePath: AbsolutePath,
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
      folderPath: string,
      options?: EffectFileSystem.MakeDirectoryOptions
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.makeDirectory(folderPath, options)
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

    const exists = (path: string): Effect.Effect<boolean, FileSystemError> =>
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
          // Skip .asar archives - Electron fakes fs.stat for these and causes issues
          if (entryName.endsWith(".asar")) {
            continue
          }

          const fullPath = AbsolutePath(path.join(currentPath, entryName))

          // Try to stat the entry - skip if it fails (broken symlink, permission denied, etc.)
          const statsResult = yield* _(fs.stat(fullPath).pipe(Effect.either))

          if (Either.isLeft(statsResult)) {
            // Skip entries we can't stat (broken symlinks, permission issues, etc.)
            continue
          }

          const stats = statsResult.right

          // Skip excluded entries (files and directories)
          if (EXCLUDED_ENTRIES.has(entryName)) {
            continue
          }

          const isGitIgnored = yield* gitIgnore.isIgnored(
            workspacePath,
            fullPath
          )

          if (stats.type === "Directory") {
            // Try to read directory children - skip if it fails
            const childrenResult = yield* _(
              readDirectory(workspacePath, fullPath).pipe(Effect.either)
            )

            if (Either.isLeft(childrenResult)) {
              // Skip directories we can't read
              continue
            }

            const folder: Folder = {
              name: entryName,
              path: fullPath,
              children: childrenResult.right,
              kind: "folder",
              cid: ZERO_HASH,
              isExpanded: false,
              isGitIgnored,
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
                mtime: Option.getOrElse(stats.mtime, () => new Date()),
                size: Number(stats.size),
              },
              isGitIgnored,
            }
            tree.push(file)
          }
        }
        return tree
      }).pipe(
        Effect.mapError(
          (error) =>
            new FileSystemError({
              message: `failed to read directory \`${currentPath}\`: ${error}`,
            })
        )
      )
    }

    const startWatcher = (path: AbsolutePath) =>
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

    const stopWatcher = (path: AbsolutePath) =>
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
      exists,
      readDirectory,
      startWatcher,
      stopWatcher,
    } as const
  }),

  dependencies: [NodeFileSystem.layer, GitIgnoreLive],
}) {}
