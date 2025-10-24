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
import { useMachine } from "@xstate/react"
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
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
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
      onRight: async (result) => {
        // if no view param, redirect to set it from determined viewKind
        if (!view) {
          throw redirect({
            search: { view: result.viewKind },
            params,
            replace: true,
          })
        }

        return {
          workspace,
          filePath,
          state: result.content,
          view: result.viewKind,
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
  const { filePath, state, view } = Route.useLoaderData()

  const sendFileState = useSetAtom(fileStateAtomFamily(filePath))

  const [, send] = useMachine(fileMachine)

  const editorConfig =
    state.kind === "state"
      ? createEditorConfigFromState(state.data.state, state.data.selection)
      : createEditorConfigFromContent(state.data, view, state.data.selection)

  // remount the editor when the cid changes
  // this is needed for reloading after external changes
  // that don't have conflicts
  const cid = state.kind === "state" ? ZERO_HASH : state.data.cid
  const key = `${filePath}-${view}-${cid}`

  return (
    <>
      <FileConflictBanner filePath={filePath} send={sendFileState} />
      <Editor
        key={key}
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
                  id: state.data.editorId,
                  selection: serializedSelection,
                },
              })
            } else {
              sendFileState({ type: "file.edit" })
              send({
                type: "editor.state.update",
                editorState: {
                  id: state.data.editorId,
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
