import path from "path"

import * as fsEffects from "@/main-process/fs"
import { commandQueue } from "@/main-process/watcher"
import { FileSystem } from "@effect/platform"
import { Effect, Option as EffectOption, Runtime } from "effect"
import { BrowserWindow, dialog, ipcMain } from "electron"

import type { File, FileTree, Folder } from "@/types/workspace"
import { ZERO_HASH } from "@/types/workspace"
import { fileTypeFromExtension } from "@/lib/workspace"

// Recursively scans a directory and builds a FileTree object.
function readWorkspace(
  workspacePath: string,
  currentPath: string
): Effect.Effect<FileTree, Error, FileSystem.FileSystem> {
  return Effect.gen(function* (_) {
    const fs = yield* _(FileSystem.FileSystem)
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
        const children = yield* _(readWorkspace(workspacePath, fullPath))
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
            mtimeMs: EffectOption.getOrElse(
              EffectOption.map(stats.mtime, (d) => d.getTime()),
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

export const registerIpcHandlers = (
  runtime: Runtime.Runtime<FileSystem.FileSystem>
) => {
  const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Runtime.runPromise(runtime)(effect)

  ipcMain.handle("read-workspace", (_, workspacePath: string) => {
    const program = Effect.gen(function* (_) {
      const tree = yield* _(readWorkspace(workspacePath, workspacePath))
      // After reading, tell the watcher service to start watching.
      // Note: The watcher service itself handles duplicate starts gracefully
      yield* _(commandQueue.offer({ _tag: "start", path: workspacePath }))
      return { success: true, tree }
    }).pipe(
      Effect.match({
        onFailure: (error) => ({ success: false, error: error.message }),
        onSuccess: (result) => result,
      })
    )
    return run(program)
  })

  ipcMain.handle("stop-watching", (_, workspacePath: string) => {
    const program = Effect.gen(function* (_) {
      yield* _(commandQueue.offer({ _tag: "stop", path: workspacePath }))
      return { success: true }
    })
    return run(program)
  })

  ipcMain.handle("show-open-dialog", async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const result = await dialog.showOpenDialog(win, options)
      return result
    } else {
      const result = await dialog.showOpenDialog(options)
      return result
    }
  })

  ipcMain.handle("show-save-dialog", async (event, options) => {
    const result = await dialog.showSaveDialog(options)
    return result
  })

  ipcMain.handle("rename-file", (_, oldPath: string, newPath: string) => {
    const program = Effect.match(fsEffects.renameFile(oldPath, newPath), {
      onFailure: (error) => ({ success: false, error: error.message }),
      onSuccess: () => ({ success: true }),
    })
    return run(program)
  })
}
