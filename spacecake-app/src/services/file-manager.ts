import { type FileSelect } from "@/schema/file"
import { Database } from "@/services/database"
import { type FileSystemError } from "@/services/file-system"
import { Effect, Option } from "effect"

import { isLeft, left, right } from "@/types/adt"
import {
  RelativePath,
  type AbsolutePath,
  type FileBuffer,
} from "@/types/workspace"
import { toAbsolutePath } from "@/lib/utils"
import { fileTypeFromFileName } from "@/lib/workspace"

const toBuffer = (
  workspacePath: AbsolutePath,
  record: FileSelect
): FileBuffer => {
  return {
    id: record.id,
    path: toAbsolutePath(workspacePath, RelativePath(record.path)),
    fileType: fileTypeFromFileName(record.path.split("/").pop() || ""),
    buffer: record.buffer ?? "",
  }
}

export class FileManager extends Effect.Service<FileManager>()("FileManager", {
  effect: Effect.gen(function* () {
    const db = yield* Database

    const readFile = (workspacePath: AbsolutePath, filePath: RelativePath) =>
      Effect.gen(function* () {
        const absolutePath = toAbsolutePath(workspacePath, filePath)

        const record = yield* db.selectFile(workspacePath, filePath)
        if (Option.isSome(record) && record.value.buffer) {
          return right<FileSystemError, FileBuffer>(
            toBuffer(workspacePath, record.value)
          )
        }

        const fileContent = yield* Effect.promise(() =>
          window.electronAPI.readFile(absolutePath)
        )

        if (isLeft(fileContent)) {
          return left<FileSystemError, FileBuffer>(fileContent.value)
        }

        const updatedRecord = yield* db.upsertFile(workspacePath)({
          path: filePath,
          cid: fileContent.value.cid,
          mtime: new Date(fileContent.value.etag.mtime).toISOString(),
          buffer: fileContent.value.content,
        })
        return right<FileSystemError, FileBuffer>(
          toBuffer(workspacePath, updatedRecord)
        )
      })

    return { readFile } as const
  }),

  dependencies: [Database.Default],
}) {}
