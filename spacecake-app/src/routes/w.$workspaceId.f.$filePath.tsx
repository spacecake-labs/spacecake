import { fileMachine } from "@/machines/manage-file"
import { JsonValue } from "@/schema/drizzle-effect"
import { Database } from "@/services/database"
import { EditorManager } from "@/services/editor-manager"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useMachine } from "@xstate/react"
import { Effect, Option, Schema } from "effect"
import { useAtom } from "jotai"
import { $getSelection, $isRangeSelection, type EditorState } from "lexical"

import { match } from "@/types/adt"
import {
  SerializedSelectionSchema,
  ViewKindSchema,
  type ChangeType,
} from "@/types/lexical"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { openedFilesAtom } from "@/lib/atoms/atoms"
import { fileStateMachineAtomFamily } from "@/lib/atoms/file-tree"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
import { supportsRichView } from "@/lib/language-support"
import { store } from "@/lib/store"
import { decodeBase64Url } from "@/lib/utils"
import { fileTypeFromExtension } from "@/lib/workspace"
import { Editor } from "@/components/editor/editor"
import { FileConflictBanner } from "@/components/editor/file-conflict-banner"
import { LoadingAnimation } from "@/components/loading-animation"

const fileSearchSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) =>
    Schema.decodeUnknownSync(fileSearchSchema)(search),
  beforeLoad: async ({ params, search }) => {
    if (search.view) {
      return
    }

    const filePath = AbsolutePath(decodeBase64Url(params.filePath))

    const storedView = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const db = yield* Database
        const maybeFile = yield* db.selectFile(filePath)
        if (Option.isSome(maybeFile)) {
          const editor = yield* db.selectLatestEditorStateForFile(
            maybeFile.value.id
          )
          if (Option.isSome(editor)) {
            return editor.value.view_kind
          }
        }
        return null
      })
    )

    const fileType = fileTypeFromExtension(filePath.split(".").pop() || "")
    const defaultView = supportsRichView(fileType) ? "rich" : "source"

    const viewKind = storedView ?? defaultView

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
    const { paneId, workspace } = context
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
          paneId: paneId,
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
        // register file as opened
        store.set(openedFilesAtom, (openedFiles: Set<AbsolutePath>) => {
          openedFiles.add(filePath)
          return openedFiles
        })
        return {
          workspace,
          filePath,
          state,
          view,
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

  const [fileState, sendFileState] = useAtom(
    fileStateMachineAtomFamily(filePath)
  )

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

  console.log("view", view)

  return (
    <>
      <FileConflictBanner state={fileState} send={sendFileState} />

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
