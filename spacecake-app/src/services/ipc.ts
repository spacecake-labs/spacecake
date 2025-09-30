import { FileSystem, type FileSystemError } from "@/services/file-system"
import { Effect } from "effect"
import { ipcMain } from "electron"

import { left, right, type Either } from "@/types/adt"
import { FileContent } from "@/types/workspace"

export class Ipc extends Effect.Service<Ipc>()("Ipc", {
  effect: Effect.gen(function* (_) {
    const fs = yield* FileSystem

    ipcMain.handle(
      "read-file",
      (_, filePath: string): Promise<Either<FileSystemError, FileContent>> =>
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
    ipcMain.handle("path-exists", (_, path: string) =>
      Effect.runPromise(
        Effect.match(fs.pathExists(path), {
          onFailure: (error) => left(error),
          onSuccess: (exists) => right(exists),
        })
      )
    )

    return {}
  }),
  dependencies: [FileSystem.Default],
}) {}
