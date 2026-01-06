import { fileMachine } from "@/machines/manage-file"
import { JsonValue } from "@/schema/drizzle-effect"
import { EditorPrimaryKeySchema } from "@/schema/editor"
import { EditorManager } from "@/services/editor-manager"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useActorRef } from "@xstate/react"
import { Effect, Schema } from "effect"
import { useSetAtom } from "jotai"
import { $getSelection, $isRangeSelection, type EditorState } from "lexical"

import { match } from "@/types/adt"
import {
  SerializedSelectionSchema,
  ViewKindSchema,
  type ChangeType,
} from "@/types/lexical"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { expandedFoldersAtom } from "@/lib/atoms/atoms"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { getFoldersToExpand } from "@/lib/auto-reveal"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
import { store } from "@/lib/store"
import { decodeBase64Url } from "@/lib/utils"
import { Editor } from "@/components/editor/editor"
import { FileConflictBanner } from "@/components/editor/file-conflict-banner"
import { LoadingAnimation } from "@/components/loading-animation"

const fileSearchSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
  editorId: Schema.optional(EditorPrimaryKeySchema),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) =>
    Schema.decodeUnknownSync(fileSearchSchema)(search),
  loaderDeps: ({ search: { view, editorId } }) => ({ view, editorId }),
  loader: async ({ params, deps: { view, editorId }, context }) => {
    const { paneId, workspace } = context
    const filePath = AbsolutePath(decodeBase64Url(params.filePath))

    // Auto-reveal: expand parent folders to show the file in the tree
    const foldersToExpand = getFoldersToExpand(filePath, workspace.path)

    store.set(expandedFoldersAtom, (prev) => {
      const next = { ...prev }
      foldersToExpand.forEach((folder) => {
        next[folder] = true
      })
      return next
    })

    const initialState = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const em = yield* EditorManager
        return yield* em.readStateOrFile({
          filePath,
          paneId: paneId,
          targetViewKind: view,
          editorId,
        })
      })
    )

    return match(initialState, {
      onLeft: (error) => {
        console.error("failed to read file:", error)
        throw redirect({
          to: "/w/$workspaceId",
          params: { workspaceId: params.workspaceId },
          search: { notFoundFilePath: filePath },
        })
      },
      onRight: (result) => {
        // add view to search params if it is not present
        if (!view) {
          throw redirect({
            search: {
              view: result.viewKind,
              // could potentially add editorId in future
              // but need to validate whether that editorId
              // corresponds to the returned content
            },
            params,
            replace: true,
          })
        }

        const editorConfig =
          result.content.kind === "state"
            ? createEditorConfigFromState(
                result.content.data.state,
                result.content.data.selection
              )
            : createEditorConfigFromContent(
                result.content.data,
                result.viewKind,
                result.content.data.selection
              )

        const cid =
          result.content.kind === "state" ? ZERO_HASH : result.content.data.cid
        const key = `${filePath}-${result.viewKind}-${cid}`

        return {
          filePath,
          editorConfig,
          key,
          editorId: result.content.data.editorId,
          fileId: result.content.data.fileId,
        }
      },
    })
  },
  pendingComponent: () => <LoadingAnimation />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
  // Do not cache this route's data after it's unloaded
  gcTime: 0,
  // Only reload the route when the user navigates to it or when deps change
  shouldReload: false,
})

function FileLayout() {
  const { filePath, editorConfig, key, editorId, fileId } =
    Route.useLoaderData()
  const { db } = Route.useRouteContext()

  const sendFileState = useSetAtom(fileStateAtomFamily(filePath))

  const send = useActorRef(fileMachine).send

  RuntimeClient.runPromise(
    Effect.gen(function* () {
      yield* Effect.forkDaemon(
        db.updateFileAccessedAt({
          id: fileId,
        })
      )
      yield* Effect.forkDaemon(
        db.updateEditorAccessedAt({
          id: editorId,
        })
      )
    })
  )

  return (
    <>
      <FileConflictBanner filePath={filePath} send={sendFileState} />
      <Editor
        key={key}
        filePath={filePath}
        editorConfig={editorConfig}
        onChange={(editorState: EditorState, changeType: ChangeType) => {
          editorState.read(() => {
            const selection = $getSelection()

            const serializedSelection = $isRangeSelection(selection)
              ? Schema.decodeUnknownSync(SerializedSelectionSchema)({
                  anchor: {
                    key: selection.anchor.key,
                    offset: selection.anchor.offset,
                  },
                  focus: {
                    key: selection.focus.key,
                    offset: selection.focus.offset,
                  },
                })
              : null

            if (changeType === "selection") {
              send({
                type: "editor.selection.update",
                editorSelection: {
                  id: editorId,
                  selection: serializedSelection,
                },
              })
            } else {
              sendFileState({ type: "file.edit" })
              send({
                type: "editor.state.update",
                editorState: {
                  id: editorId,
                  state: Schema.decodeUnknownSync(JsonValue)(
                    editorState.toJSON()
                  ),
                  selection: serializedSelection,
                },
              })
            }
          })
        }}
      />
    </>
  )
}
