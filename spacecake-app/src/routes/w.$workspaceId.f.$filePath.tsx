import { fileMachine } from "@/machines/manage-file"
import { FileManager } from "@/services/file-manager"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useMachine } from "@xstate/react"
import { Effect, Schema } from "effect"
import { useSetAtom } from "jotai"
import { type EditorState } from "lexical"

import { match } from "@/types/adt"
import { ViewKindSchema } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"
import { editorStateAtom } from "@/lib/atoms/atoms"
import {
  createEditorConfigFromContent,
  serializeFileContent,
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
    const { db, pane, workspace } = context
    const filePath = AbsolutePath(decodeBase64Url(params.filePath))
    console.log("filePath", filePath)
    const fileRecord = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const fm = yield* FileManager
        return yield* fm.readFile(filePath)
      })
    )

    return match(fileRecord, {
      onLeft: (error) => {
        console.error("failed to read file:", error)
        throw redirect({
          to: "/w/$workspaceId",
          params: { workspaceId: params.workspaceId },
          search: { notFoundFilePath: filePath },
        })
      },
      onRight: async (file) => {
        if (!view) {
          // this should be an impossible state because of the beforeLoad redirect.
          // we'll throw to make it clear if it ever occurs.
          throw new Error("invariant: view param should be present in loader")
        }

        const editor = await RuntimeClient.runPromise(
          (await db).upsertEditor({
            pane_id: pane.id,
            file_id: file.id,
            view_kind: view,
            position: 0, // assuming single editor per pane for now
            is_active: true,
          })
        )

        return {
          workspace,
          filePath,
          file,
          editor,
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
  const { filePath, file, editor } = Route.useLoaderData()
  const { view_kind: view } = editor

  const [, send] = useMachine(fileMachine)

  // const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)

  const editorConfig = createEditorConfigFromContent(file, view)

  // Set up atoms when component mounts
  // useEffect(() => {
  //   // Set atoms for this file
  //   // setFile(file)

  //   if (workspace?.path) {
  //     // open file in tab layout (handles existing tabs properly)
  //     openFile(localStorageService, filePath, workspace.path)
  //   }
  // }, [workspace, file, filePath, setFile])

  return (
    <>
      <Editor
        key={`${filePath}-${view}`}
        editorConfig={editorConfig}
        onChange={(editorState: EditorState) => {
          setEditorState(editorState.toJSON())
          send({
            type: "file.update.buffer",
            file: {
              path: filePath,
              buffer: serializeFileContent(editorState, file),
            },
          })
        }}
      />
    </>
  )
}
