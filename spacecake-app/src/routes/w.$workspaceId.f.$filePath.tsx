import { fileMachine } from "@/machines/manage-file"
import { JsonValue } from "@/schema/drizzle-effect"
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
import { AbsolutePath } from "@/types/workspace"
import { fileStateMachineAtomFamily } from "@/lib/atoms/file-tree"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
import { decodeBase64Url } from "@/lib/utils"
import { determineView } from "@/lib/view"
import { Editor } from "@/components/editor/editor"

const fileSearchSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) =>
    Schema.decodeUnknownSync(fileSearchSchema)(search),
  beforeLoad: async ({ params, search, context }) => {
    if (search.view) {
      return
    }

    const { db } = context
    const dbInstance = await db
    const workspacePath = AbsolutePath(decodeBase64Url(params.workspaceId))
    const filePath = AbsolutePath(decodeBase64Url(params.filePath))

    const viewKind = await determineView(
      dbInstance.orm,
      workspacePath,
      filePath,
      search.view
    )

    throw redirect({
      search: {
        ...search,
        view: viewKind,
      },
      params,
      replace: true,
    })
  },
  loaderDeps: ({ search: { view } }) => ({ view }),
  loader: async ({ params, deps: { view }, context }) => {
    const { pane, workspace } = context
    const filePath = AbsolutePath(decodeBase64Url(params.filePath))

    if (!view) {
      // this should be an impossible state because of the beforeLoad redirect.
      // we'll throw to make it clear if it ever occurs.
      throw new Error("invariant: view param should be present in loader")
    }

    const initialState = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const em = yield* EditorManager
        return yield* em.readStateOrFile({
          filePath,
          paneId: pane.id,
          targetViewKind: view,
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
      onRight: async (state) => {
        return {
          workspace,
          filePath,
          state,
          view,
        }
      },
    })
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
  // Do not cache this route's data after it's unloaded
  gcTime: 0,
  // Only reload the route when the user navigates to it or when deps change
  shouldReload: false,
})

function FileLayout() {
  const { filePath, state, view } = Route.useLoaderData()
  const setFileState = useSetAtom(fileStateMachineAtomFamily(filePath))

  const [, send] = useMachine(fileMachine)

  const editorConfig =
    state.kind === "state"
      ? createEditorConfigFromState(state.data.state, state.data.selection)
      : createEditorConfigFromContent(state.data, view)

  return (
    <>
      <Editor
        key={`${filePath}-${view}`}
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
              setFileState({ type: "file.edit" })
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
