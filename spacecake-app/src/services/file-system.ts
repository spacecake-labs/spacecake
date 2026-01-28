import path from "path"

import { WatcherFileSystemLive, WatcherService } from "@/main-process/watcher"
import { GitIgnore, GitIgnoreLive } from "@/services/git-ignore-parser"
import { SpacecakeHome } from "@/services/spacecake-home"
import { FileSystem as EffectFileSystem } from "@effect/platform"
import type { PlatformError } from "@effect/platform/Error"
import { Data, Effect, Either, Option } from "effect"
import writeFileAtomic from "write-file-atomic"

import type { File, FileContent, FileTree, Folder } from "@/types/workspace"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"
import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"

/** Common file permission modes */
export const FileMode = {
  /** rwxr-xr-x - executable scripts */
  EXECUTABLE: 0o755,
  /** rw-r--r-- - regular files */
  READ_WRITE: 0o644,
  /** rw------- - private files (only owner) */
  PRIVATE: 0o600,
} as const

// Tagged error classes for type-safe pattern matching with Match.tag()
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly path?: string
  readonly description: string
}> {}

export class PermissionDeniedError extends Data.TaggedError(
  "PermissionDeniedError"
)<{
  readonly path?: string
  readonly description: string
}> {}

export class AlreadyExistsError extends Data.TaggedError("AlreadyExistsError")<{
  readonly path?: string
  readonly description: string
}> {}

export class UnknownFSError extends Data.TaggedError("UnknownFSError")<{
  readonly path?: string
  readonly description: string
}> {}

// Union type for all file system errors
export type FileSystemError =
  | NotFoundError
  | PermissionDeniedError
  | AlreadyExistsError
  | UnknownFSError

// Helper to map Effect's PlatformError to our tagged errors
const toFileSystemError = (
  error: PlatformError,
  fallbackPath?: string
): FileSystemError => {
  const errorPath =
    error._tag === "SystemError" && typeof error.pathOrDescriptor === "string"
      ? error.pathOrDescriptor
      : fallbackPath

  if (error._tag === "SystemError") {
    switch (error.reason) {
      case "PermissionDenied":
        return new PermissionDeniedError({
          path: errorPath,
          description: error.message,
        })
      case "NotFound":
        return new NotFoundError({
          path: errorPath,
          description: error.message,
        })
      case "AlreadyExists":
        return new AlreadyExistsError({
          path: errorPath,
          description: error.message,
        })
      default:
        return new UnknownFSError({
          path: errorPath,
          description: error.message,
        })
    }
  }
  // BadArgument or other
  return new UnknownFSError({ path: errorPath, description: error.message })
}

export class FileSystem extends Effect.Service<FileSystem>()("app/FileSystem", {
  // define how to create the service
  effect: Effect.gen(function* () {
    const fs = yield* EffectFileSystem.FileSystem
    const gitIgnore = yield* GitIgnore
    const watcher = yield* WatcherService
    const home = yield* SpacecakeHome

    // helper to detect system folders (the .app folder inside ~/.spacecake)
    const isSystemFolder = (folderPath: string): boolean => {
      return folderPath === home.appDir
    }

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
      }).pipe(Effect.mapError((error) => toFileSystemError(error, filePath)))
    const writeTextFile = (
      filePath: AbsolutePath,
      content: string,
      options?: { mode?: number }
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: async () =>
            await writeFileAtomic(filePath, content, {
              encoding: "utf8",
              mode: options?.mode,
            }),
          catch: (error) => error,
        })
      }).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: filePath,
              description: `failed to write file: ${String(error)}`,
            })
        )
      )

    const createFolder = (
      folderPath: string,
      options?: EffectFileSystem.MakeDirectoryOptions
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.makeDirectory(folderPath, options)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, folderPath)))

    const remove = (targetPath: string, recursive?: boolean) =>
      Effect.gen(function* (_) {
        return yield* fs.remove(targetPath, { recursive: recursive })
      }).pipe(Effect.mapError((error) => toFileSystemError(error, targetPath)))

    const rename = (
      oldPath: string,
      newPath: string
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.rename(oldPath, newPath)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, oldPath)))

    const exists = (
      targetPath: string
    ): Effect.Effect<boolean, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.exists(targetPath)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, targetPath)))

    const readDirectory = (
      workspacePath: string,
      currentPath: string = workspacePath
    ): Effect.Effect<FileTree, FileSystemError> => {
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
              isSystemFolder: isSystemFolder(fullPath),
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
        Effect.mapError((error) => {
          // For PlatformErrors, use our typed error mapper
          if (
            error &&
            typeof error === "object" &&
            "_tag" in error &&
            (error._tag === "SystemError" || error._tag === "BadArgument")
          ) {
            return toFileSystemError(error as PlatformError, currentPath)
          }
          // For other errors, wrap in UnknownFSError
          return new UnknownFSError({
            path: currentPath,
            description: `failed to read directory: ${String(error)}`,
          })
        })
      )
    }

    const startWatcher = (watchPath: AbsolutePath) =>
      watcher.start(watchPath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: watchPath,
              description: `failed to watch path: ${String(error)}`,
            })
        )
      )

    const stopWatcher = (watchPath: AbsolutePath) =>
      watcher.stop(watchPath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: watchPath,
              description: `failed to stop watcher: ${String(error)}`,
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

  dependencies: [WatcherFileSystemLive, GitIgnoreLive, WatcherService.Default],
}) {}
