import { PaneSelect } from "@/schema"
import { EditorPrimaryKey } from "@/schema/editor"
import { Database, PgliteError } from "@/services/database"
import { FileSystemError } from "@/services/file-system"
import { Data, Effect, Option } from "effect"

import { isLeft, isRight, left, right, type Either } from "@/types/adt"
import { ViewKind } from "@/types/lexical"
import {
  AbsolutePath,
  FileType,
  type EditorCache,
  type EditorFile,
} from "@/types/workspace"
import { serializeFromCache } from "@/lib/editor"
import { fnv1a64Hex } from "@/lib/hash"
import { supportsRichView } from "@/lib/language-support"
import { fileTypeFromFileName } from "@/lib/workspace"

// Define a specific error type for this service
export class EditorManagerError extends Data.TaggedError("EditorManagerError")<{
  cause: unknown
}> {}

export type InitialContent = {
  viewKind: ViewKind
  content:
    | { kind: "state"; data: EditorCache }
    | { kind: "file"; data: EditorFile }
}

const determineViewKind = (
  targetViewKind: ViewKind | undefined,
  maybeState: Either<PgliteError, EditorCache>,
  fileType: FileType
): ViewKind => {
  if (targetViewKind) return targetViewKind
  if (isRight(maybeState)) return maybeState.value.viewKind
  return supportsRichView(fileType) ? "rich" : "source"
}

export class EditorManager extends Effect.Service<EditorManager>()(
  "EditorManager",
  {
    effect: Effect.gen(function* () {
      const db = yield* Database

      const readEditorState = (
        filePath: AbsolutePath,
        editorId?: EditorPrimaryKey
      ) =>
        Effect.gen(function* () {
          const maybeEditor = yield* editorId
            ? db.selectEditorStateById(editorId)
            : db.selectLatestEditorStateForFile(filePath)

          if (Option.isSome(maybeEditor)) {
            const editor = maybeEditor.value

            return right<PgliteError, EditorCache>({
              editorId: editor.id,
              viewKind: editor.view_kind,
              state: editor.state,
              fileId: editor.fileId,
              selection: Option.getOrNull(editor.selection),
            })
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
            cid: fileContent.value.cid,
          } as EditorFile)
        })

      const readStateOrFile = (props: {
        filePath: AbsolutePath
        paneId: PaneSelect["id"]
        targetViewKind?: ViewKind | undefined
        editorId?: EditorPrimaryKey | undefined
      }) =>
        Effect.gen(function* () {
          const maybeState = yield* readEditorState(
            props.filePath,
            props.editorId
          )

          if (isRight(maybeState) && maybeState.value.state) {
            // if no targetViewKind specified, or it matches the stored viewKind,
            // return the stored state
            if (
              !props.targetViewKind ||
              props.targetViewKind === maybeState.value.viewKind
            ) {
              // Activate the editor in the pane (creates paneItem, updates pointers)
              yield* Effect.forkDaemon(
                db.activateEditorInPane(maybeState.value.editorId, props.paneId)
              )

              return right<
                PgliteError | FileSystemError | EditorManagerError,
                InitialContent
              >({
                viewKind: maybeState.value.viewKind,
                content: {
                  kind: "state",
                  data: maybeState.value,
                },
              })
            }

            // else convert the content to the target view kind
            const fileType = fileTypeFromFileName(props.filePath)
            const content = serializeFromCache(maybeState.value.state, fileType)
            const cid = fnv1a64Hex(content)

            // update timestamp, but keep view_kind matching the cached state
            // (the cached state is for the old view, so view_kind should reflect that)
            yield* Effect.forkDaemon(
              Effect.gen(function* () {
                yield* db.upsertEditor({
                  pane_id: props.paneId,
                  file_id: maybeState.value.fileId,
                  view_kind: maybeState.value.viewKind,
                })
                yield* db.activateEditorInPane(
                  maybeState.value.editorId,
                  props.paneId
                )
              })
            )

            return right<
              PgliteError | FileSystemError | EditorManagerError,
              InitialContent
            >({
              viewKind: props.targetViewKind,
              content: {
                kind: "file",
                data: {
                  fileId: maybeState.value.fileId,
                  editorId: maybeState.value.editorId,
                  path: props.filePath,
                  fileType: fileType,
                  content: content,
                  cid: cid,
                  // Don't restore selection when switching views - offsets are view-specific
                  selection: null,
                },
              },
            })
          }

          const maybeFile = yield* readFile(props.filePath)

          if (isRight(maybeFile)) {
            const fileType = fileTypeFromFileName(props.filePath)

            const viewKind = determineViewKind(
              props.targetViewKind,
              maybeState,
              fileType
            )

            const editor = yield* db.upsertEditor({
              pane_id: props.paneId,
              file_id: maybeFile.value.fileId,
              view_kind: viewKind,
            })

            // Activate the editor in the pane (creates paneItem, updates pointers)
            yield* Effect.forkDaemon(
              db.activateEditorInPane(editor.id, props.paneId)
            )

            // Only restore selection if prior state had matching view kind
            const priorSelection =
              isRight(maybeState) && maybeState.value.viewKind === viewKind
                ? maybeState.value.selection
                : null

            return right<
              PgliteError | FileSystemError | EditorManagerError,
              InitialContent
            >({
              viewKind: viewKind,
              content: {
                kind: "file",
                data: {
                  ...maybeFile.value,
                  editorId: editor.id,
                  selection: priorSelection,
                },
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
