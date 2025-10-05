import { FileSystem, type FileSystemError } from "@/services/file-system"
import { Effect } from "effect"
import { BrowserWindow, dialog, ipcMain } from "electron"

import { left, right, type Either } from "@/types/adt"
import { AbsolutePath, FileContent } from "@/types/workspace"

export class Ipc extends Effect.Service<Ipc>()("Ipc", {
  effect: Effect.gen(function* (_) {
    const fs = yield* FileSystem

    ipcMain.handle(
      "read-file",
      (
        _,
        filePath: AbsolutePath
      ): Promise<Either<FileSystemError, FileContent>> =>
        Effect.runPromise(
          Effect.match(fs.readTextFile(filePath), {
            onFailure: (error) => left(error),
            onSuccess: (file) => right(file),
          })
        )
    )
    ipcMain.handle("save-file", (_, path, content) =>
      Effect.runPromise(
        Effect.match(fs.writeTextFile(path, content), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("create-folder", (_, folderPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.createFolder(folderPath), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("remove", (_, path: AbsolutePath, recursive?: boolean) =>
      Effect.runPromise(
        Effect.match(fs.remove(path, recursive), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("rename", (_, path: AbsolutePath, newPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.rename(path, newPath), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("path-exists", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.pathExists(path), {
          onFailure: (error) => left(error),
          onSuccess: (exists) => right(exists),
        })
      )
    )
    ipcMain.handle("read-directory", (_, path: string) =>
      Effect.runPromise(
        Effect.match(fs.readDirectory(path), {
          onFailure: (error) => left(error),
          onSuccess: (tree) => right(tree),
        })
      )
    )
    ipcMain.handle("start-watcher", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.startWatcher(path), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("stop-watcher", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.stopWatcher(path), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        })
      )
    )
    ipcMain.handle("show-open-dialog", (event, options) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        return dialog.showOpenDialog(win, options)
      } else {
        return dialog.showOpenDialog(options)
      }
    })

    return {}
  }),
  dependencies: [FileSystem.Default],
}) {}
