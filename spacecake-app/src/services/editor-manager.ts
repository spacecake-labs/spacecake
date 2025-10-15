import { PaneSelect } from "@/schema"
import { Database, PgliteError } from "@/services/database"
import { FileSystemError } from "@/services/file-system"
import { Data, Effect, Option } from "effect"

import { isLeft, isRight, left, right } from "@/types/adt"
import { ViewKind } from "@/types/lexical"
import { AbsolutePath, EditorFile, type EditorCache } from "@/types/workspace"
import { serializeFromCache } from "@/lib/editor"
import { fileTypeFromFileName } from "@/lib/workspace"

// Define a specific error type for this service
export class EditorManagerError extends Data.TaggedError("EditorManagerError")<{
  cause: unknown
}> {}

export type InitialContent =
  | { kind: "state"; data: EditorCache }
  | { kind: "file"; data: EditorFile }

export class EditorManager extends Effect.Service<EditorManager>()(
  "EditorManager",
  {
    effect: Effect.gen(function* () {
      const db = yield* Database

      const readEditorState = (filePath: AbsolutePath) =>
        Effect.gen(function* () {
          const file = yield* db.selectFile(filePath)

          if (Option.isSome(file)) {
            yield* db.updateFileAccessedAt({
              id: file.value.id,
            })

            const editor = yield* db.selectLatestEditorStateForFile(
              file.value.id
            )
            if (Option.isSome(editor)) {
              yield* db.updateEditorAccessedAt({
                id: editor.value.id,
              })
              if (editor.value.state) {
                return right<PgliteError, EditorCache>({
                  editorId: editor.value.id,
                  viewKind: editor.value.view_kind,
                  state: editor.value.state,
                  fileId: file.value.id,
                })
              }
            }
          }
          return left<PgliteError, EditorCache>(
            new PgliteError({ cause: "editor state not found" })
          )
        })

      const readFile = (filePath: AbsolutePath) =>
        Effect.gen(function* () {
          const fileContent = yield* Effect.promise(() =>
            window.electronAPI.readFile(filePath)
          )

          if (isLeft(fileContent)) {
            return left<FileSystemError, EditorFile>(fileContent.value)
          }

          const updatedRecord = yield* db.upsertFile()({
            path: filePath,
            cid: fileContent.value.cid,
            mtime: new Date(fileContent.value.etag.mtime).toISOString(),
          })

          return right<FileSystemError, EditorFile>({
            fileId: updatedRecord.id,
            path: AbsolutePath(updatedRecord.path),
            fileType: fileTypeFromFileName(updatedRecord.path),
            content: fileContent.value.content,
          } as EditorFile)
        })

      const readStateOrFile = (props: {
        filePath: AbsolutePath
        paneId: PaneSelect["id"]
        targetViewKind: ViewKind
      }) =>
        Effect.gen(function* () {
          const maybeState = yield* readEditorState(props.filePath)

          if (isRight(maybeState)) {
            if (maybeState.value.viewKind == props.targetViewKind) {
              return right<
                PgliteError | FileSystemError | EditorManagerError,
                InitialContent
              >({
                kind: "state",
                data: maybeState.value,
              })
            }
            const fileType = fileTypeFromFileName(props.filePath)

            return right<
              PgliteError | FileSystemError | EditorManagerError,
              InitialContent
            >({
              kind: "file",
              data: {
                fileId: maybeState.value.fileId,
                editorId: maybeState.value.editorId,
                path: props.filePath,
                fileType: fileType,
                content: serializeFromCache(maybeState.value.state, fileType),
              },
            })
          }

          const maybeFile = yield* readFile(props.filePath)

          if (isRight(maybeFile)) {
            const editor = yield* db.upsertEditor({
              pane_id: props.paneId,
              file_id: maybeFile.value.fileId,
              view_kind: props.targetViewKind,
              position: 0, // assuming single editor per pane for now
              is_active: true,
            })
            return right<
              PgliteError | FileSystemError | EditorManagerError,
              InitialContent
            >({
              kind: "file",
              data: {
                ...maybeFile.value,
                editorId: editor.id,
              },
            })
          }
          return left<
            PgliteError | FileSystemError | EditorManagerError,
            InitialContent
          >(new EditorManagerError({ cause: "editor state not found" }))
        })

      return { readStateOrFile }
    }),
    dependencies: [Database.Default],
  }
) {}
