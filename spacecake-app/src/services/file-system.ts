import type { PlatformError } from "@effect/platform/Error"

import { FileSystem as EffectFileSystem } from "@effect/platform"
import { Data, Effect, Either, Option } from "effect"
import NFS from "node:fs/promises"
import path from "path"
import writeFileAtomic from "write-file-atomic"

import type { File, FileContent, FileTree, Folder } from "@/types/workspace"

import { fnv1a64Hex } from "@/lib/hash"
import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"
import { normalizePath } from "@/lib/utils"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"
import { WatcherFileSystemLive, WatcherService } from "@/main-process/watcher"
import { GitIgnore, GitIgnoreLive } from "@/services/git-ignore-parser"
import { SpacecakeHome } from "@/services/spacecake-home"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"

/** lightweight file entry for quick-open index (no stat, no cid, no etag) */
export type IndexedFile = {
  path: string
  name: string
  isGitIgnored: boolean
}

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

export class PermissionDeniedError extends Data.TaggedError("PermissionDeniedError")<{
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
const toFileSystemError = (error: PlatformError, fallbackPath?: string): FileSystemError => {
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

    const readTextFile = (filePath: AbsolutePath): Effect.Effect<FileContent, FileSystemError> =>
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
      options?: { mode?: number },
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
            }),
        ),
      )

    const createFolder = (
      folderPath: string,
      options?: EffectFileSystem.MakeDirectoryOptions,
    ): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.makeDirectory(folderPath, options)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, folderPath)))

    const remove = (targetPath: string, recursive?: boolean) =>
      Effect.gen(function* (_) {
        return yield* fs.remove(targetPath, { recursive: recursive })
      }).pipe(Effect.mapError((error) => toFileSystemError(error, targetPath)))

    const rename = (oldPath: string, newPath: string): Effect.Effect<void, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.rename(oldPath, newPath)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, oldPath)))

    const exists = (targetPath: string): Effect.Effect<boolean, FileSystemError> =>
      Effect.gen(function* () {
        return yield* fs.exists(targetPath)
      }).pipe(Effect.mapError((error) => toFileSystemError(error, targetPath)))

    const readDirectory = (
      workspacePath: string,
      currentPath: string = workspacePath,
      options?: { recursive?: boolean },
    ): Effect.Effect<FileTree, FileSystemError> => {
      return Effect.gen(function* (_) {
        // use withFileTypes to avoid per-entry stat() calls
        const dirents = yield* Effect.tryPromise({
          try: () => NFS.readdir(currentPath, { withFileTypes: true }),
          catch: (error) => error,
        })

        const tree: FileTree = []

        for (const entry of dirents) {
          const entryName = entry.name

          // skip .asar archives — Electron fakes fs.stat for these and causes issues
          if (entryName.endsWith(".asar")) {
            continue
          }

          if (EXCLUDED_ENTRIES.has(entryName)) {
            continue
          }

          const fullPath = AbsolutePath(normalizePath(path.join(currentPath, entryName)))

          const isGitIgnored = yield* gitIgnore.isIgnored(workspacePath, fullPath)

          if (entry.isDirectory()) {
            let children: FileTree = []
            let resolved = false

            if (options?.recursive) {
              const childrenResult = yield* _(
                readDirectory(workspacePath, fullPath, options).pipe(Effect.either),
              )

              if (Either.isLeft(childrenResult)) {
                // skip directories we can't read
                continue
              }

              children = childrenResult.right
              resolved = true
            }

            const folder: Folder = {
              name: entryName,
              path: fullPath,
              children,
              kind: "folder",
              cid: ZERO_HASH,
              isExpanded: false,
              resolved,
              isGitIgnored,
              isSystemFolder: isSystemFolder(fullPath),
            }
            tree.push(folder)
          } else if (entry.isFile()) {
            const file: File = {
              name: entryName,
              path: fullPath,
              fileType: fileTypeFromExtension(path.extname(entryName)),
              kind: "file",
              cid: ZERO_HASH,
              etag: { mtime: new Date(0), size: 0 },
              isGitIgnored,
            }
            tree.push(file)
          }
          // skip symlinks, sockets, etc.
        }
        return tree
      }).pipe(
        Effect.mapError((error) => {
          if (
            error &&
            typeof error === "object" &&
            "_tag" in error &&
            (error._tag === "SystemError" || error._tag === "BadArgument")
          ) {
            return toFileSystemError(error as PlatformError, currentPath)
          }
          // map raw Node.js errno codes to typed errors
          if (error && typeof error === "object" && "code" in error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === "EACCES" || code === "EPERM") {
              return new PermissionDeniedError({
                path: currentPath,
                description: `failed to read directory: ${String(error)}`,
              })
            }
            if (code === "ENOENT") {
              return new NotFoundError({
                path: currentPath,
                description: `failed to read directory: ${String(error)}`,
              })
            }
          }
          return new UnknownFSError({
            path: currentPath,
            description: `failed to read directory: ${String(error)}`,
          })
        }),
      )
    }

    const startWatcher = (watchPath: AbsolutePath) =>
      watcher.startWorkspace(watchPath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: watchPath,
              description: `failed to watch workspace: ${String(error)}`,
            }),
        ),
      )

    const stopWatcher = (watchPath: AbsolutePath) =>
      watcher.stopWorkspace(watchPath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: watchPath,
              description: `failed to stop workspace watcher: ${String(error)}`,
            }),
        ),
      )

    const startFileWatcher = (filePath: AbsolutePath, channel: string) =>
      watcher.startFile(filePath, channel).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: filePath,
              description: `failed to watch file: ${String(error)}`,
            }),
        ),
      )

    const stopFileWatcher = (filePath: AbsolutePath) =>
      watcher.stopFile(filePath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: filePath,
              description: `failed to stop file watcher: ${String(error)}`,
            }),
        ),
      )

    const startDirWatcher = (
      dirPath: AbsolutePath,
      channel: string,
      filter?: (path: string) => boolean,
    ) =>
      watcher.startDir(dirPath, channel, filter).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: dirPath,
              description: `failed to watch directory: ${String(error)}`,
            }),
        ),
      )

    const stopDirWatcher = (dirPath: AbsolutePath) =>
      watcher.stopDir(dirPath).pipe(
        Effect.mapError(
          (error) =>
            new UnknownFSError({
              path: dirPath,
              description: `failed to stop directory watcher: ${String(error)}`,
            }),
        ),
      )

    const listFiles = (workspacePath: string): Effect.Effect<IndexedFile[], FileSystemError> =>
      Effect.gen(function* () {
        const entries = yield* Effect.tryPromise({
          try: () => NFS.readdir(workspacePath, { recursive: true, withFileTypes: true }),
          catch: (error) =>
            new UnknownFSError({
              path: workspacePath,
              description: `failed to list files: ${String(error)}`,
            }),
        })

        const files: IndexedFile[] = []

        for (const entry of entries) {
          if (!entry.isFile()) continue

          // skip .asar files
          if (entry.name.endsWith(".asar")) continue

          // skip entries whose parent segments include excluded names
          const parentDir = entry.parentPath
          const relativePath = path.relative(workspacePath, parentDir)
          const segments = relativePath ? relativePath.split(path.sep) : []
          if (segments.some((seg) => EXCLUDED_ENTRIES.has(seg))) continue

          const fullPath = normalizePath(path.join(parentDir, entry.name))
          const isGitIgnored = yield* gitIgnore.isIgnored(workspacePath, fullPath)

          files.push({
            path: fullPath,
            name: entry.name,
            isGitIgnored,
          })
        }

        return files
      }).pipe(
        Effect.mapError((error) => {
          if (error instanceof UnknownFSError) return error
          return new UnknownFSError({
            path: workspacePath,
            description: `failed to list files: ${String(error)}`,
          })
        }),
      )

    return {
      readTextFile,
      writeTextFile,
      createFolder,
      remove,
      rename,
      exists,
      readDirectory,
      listFiles,
      startWatcher,
      stopWatcher,
      startFileWatcher,
      stopFileWatcher,
      startDirWatcher,
      stopDirWatcher,
    } as const
  }),

  dependencies: [WatcherFileSystemLive, GitIgnoreLive, WatcherService.Default],
}) {}
