import { type FileSelect } from "@/schema/file"
import { Database } from "@/services/database"
import { type FileSystemError } from "@/services/file-system"
import { Effect, Option } from "effect"

import { isLeft, left, right } from "@/types/adt"
import { AbsolutePath, type FileBuffer } from "@/types/workspace"
import { fileTypeFromFileName } from "@/lib/workspace"

const toBuffer = (record: FileSelect): FileBuffer => {
  return {
    id: record.id,
    path: AbsolutePath(record.path),
    fileType: fileTypeFromFileName(record.path.split("/").pop() || ""),
    buffer: record.buffer ?? "",
  }
}

export class FileManager extends Effect.Service<FileManager>()("FileManager", {
  effect: Effect.gen(function* () {
    const db = yield* Database

    const readFile = (filePath: AbsolutePath) =>
      Effect.gen(function* () {
        console.log("readFile", filePath)

        const record = yield* db.selectFile(filePath)
        if (Option.isSome(record) && record.value.buffer) {
          return right<FileSystemError, FileBuffer>(toBuffer(record.value))
        }

        const fileContent = yield* Effect.promise(() =>
          window.electronAPI.readFile(filePath)
        )

        if (isLeft(fileContent)) {
          return left<FileSystemError, FileBuffer>(fileContent.value)
        }

        const updatedRecord = yield* db.upsertFile()({
          path: filePath,
          cid: fileContent.value.cid,
          mtime: new Date(fileContent.value.etag.mtime).toISOString(),
          buffer: fileContent.value.content,
        })
        return right<FileSystemError, FileBuffer>(toBuffer(updatedRecord))
      })

    return { readFile } as const
  }),

  dependencies: [Database.Default],
}) {}
