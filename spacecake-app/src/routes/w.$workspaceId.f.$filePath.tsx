import { createFileRoute, ErrorComponent, redirect } from "@tanstack/react-router"
import { useActorRef } from "@xstate/react"
import { Effect, Schema } from "effect"
import { useSetAtom } from "jotai"
import { $getSelection, $isRangeSelection, type EditorState } from "lexical"
import { useEffect } from "react"

import { Editor } from "@/components/editor/editor"
import { LoadingAnimation } from "@/components/loading-animation"
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings"
import { expandedFoldersAtom, fileTreeAtom } from "@/lib/atoms/atoms"
import { fileStateAtomFamily, findFolderInTree, updateFolderInTree } from "@/lib/atoms/file-tree"
import { getFoldersToExpand } from "@/lib/auto-reveal"
import {
  createEditorConfigFromContent,
  createEditorConfigFromDiff,
  createEditorConfigFromState,
} from "@/lib/editor"
import { readDirectory } from "@/lib/fs"
import { createRichViewClaudeSelection } from "@/lib/selection-utils"
import { store } from "@/lib/store"
import { decodeBase64Url } from "@/lib/utils"
import { fileMachine } from "@/machines/manage-file"
import { JsonValue } from "@/schema/drizzle-effect"
import { EditorPrimaryKeySchema } from "@/schema/editor"
import { Database } from "@/services/database"
import { EditorManager } from "@/services/editor-manager"
import { RuntimeClient } from "@/services/runtime-client"
import { match } from "@/types/adt"
import {
  type ClaudeSelection,
  type EditorExtendedSelection,
  type SelectionChangedPayload,
} from "@/types/claude-code"
import { SerializedSelectionSchema, ViewKindSchema, type ChangeType } from "@/types/lexical"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"

const OpenFileSourceSchema = Schema.Union(Schema.Literal("claude"), Schema.Literal("cli"))

const fileSearchSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
  editorId: Schema.optional(EditorPrimaryKeySchema),
  source: Schema.optional(OpenFileSourceSchema),
  baseRef: Schema.optional(Schema.String),
  targetRef: Schema.optional(Schema.String),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) => Schema.decodeUnknownSync(fileSearchSchema)(search),
  loaderDeps: ({ search: { view, editorId, baseRef, targetRef } }) => ({
    view,
    editorId,
    baseRef,
    targetRef,
  }),
  loader: async ({ params, deps: { view, editorId, baseRef, targetRef }, context }) => {
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

    // resolve unresolved parent folders so the nested file is visible in the tree
    for (const folderPath of foldersToExpand) {
      const tree = store.get(fileTreeAtom)
      const folder = findFolderInTree(tree, folderPath)
      if (folder && !folder.resolved) {
        const result = await readDirectory(workspace.path, folderPath)
        match(result, {
          onLeft: () => {},
          onRight: (children) => {
            store.set(fileTreeAtom, (prev) =>
              updateFolderInTree(prev, folderPath, (f) => ({
                ...f,
                children,
                resolved: true,
              })),
            )
          },
        })
      }
    }

    // Route loader is read-only for content - pane item creation is normally handled
    // by the pane machine before navigation. However, for direct URL navigation
    // (typing URL, browser back/forward, bookmarks), we need to ensure the pane item
    // exists.
    const initialState = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const em = yield* EditorManager
        return yield* em.readStateOrFile({
          filePath,
          paneId: paneId,
          targetViewKind: view,
          editorId,
        })
      }),
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
        // Ensure pane item exists for direct URL navigation
        // This is safe because direct URL nav doesn't race with close operations
        await RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.activateEditorInPane(result.content.data.editorId, paneId)
          }),
        )

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

        const cid = result.content.kind === "state" ? ZERO_HASH : result.content.data.cid
        const epoch = store.get(fileStateAtomFamily(filePath)).context.epoch
        const key = `${filePath}-${result.viewKind}-${cid}-${epoch}`

        // Handle diff view - fetch git diff data and create diff editor config
        if (result.viewKind === "diff") {
          const relativePath = filePath.startsWith(workspace.path + "/")
            ? filePath.slice(workspace.path.length + 1)
            : filePath

          const diffResult = await window.electronAPI.git.getFileDiff(
            workspace.path,
            relativePath,
            baseRef,
            targetRef,
          )

          return match(diffResult, {
            onLeft: (error) => ({
              filePath,
              editorConfig: null,
              key,
              editorId: result.content.data.editorId,
              fileId: result.content.data.fileId,
              diffError: error.description,
            }),
            onRight: (diff) => {
              const extension = filePath.split(".").pop() || ""
              const editorConfig = createEditorConfigFromDiff({
                oldContent: diff.oldContent,
                newContent: diff.newContent,
                filePath,
                language: extension,
              })

              return {
                filePath,
                editorConfig,
                key,
                editorId: result.content.data.editorId,
                fileId: result.content.data.fileId,
                diffError: null,
              }
            },
          })
        }

        // Handle source/rich view
        const editorConfig =
          result.content.kind === "state"
            ? createEditorConfigFromState(result.content.data.state, result.content.data.selection)
            : createEditorConfigFromContent(
                result.content.data,
                result.viewKind,
                result.content.data.selection,
              )

        return {
          filePath,
          editorConfig,
          key,
          editorId: result.content.data.editorId,
          fileId: result.content.data.fileId,
          diffError: null,
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
  const { filePath, editorConfig, key, editorId, fileId, diffError } = Route.useLoaderData()
  const { db, workspace } = Route.useRouteContext()
  const { view: viewKind } = Route.useSearch()

  const sendFileState = useSetAtom(fileStateAtomFamily(filePath))

  const send = useActorRef(fileMachine).send

  // Get workspace settings for autosave (not used for diff view since it's read-only)
  const { settings } = useWorkspaceSettings(workspace.id)
  const autosaveEnabled = viewKind !== "diff" && settings.autosave === "on"

  // Helper to notify Claude Code of selection changes
  const notifyClaudeCodeSelection = (selectedText: string, selection: ClaudeSelection) => {
    if (!window.electronAPI?.claude?.notifySelectionChanged) {
      return
    }

    const payload: SelectionChangedPayload = {
      text: selectedText,
      filePath,
      fileUrl: `file://${filePath}`,
      selection,
    }

    window.electronAPI.claude.notifySelectionChanged(payload)
  }

  useEffect(() => {
    RuntimeClient.runPromise(
      db.updateFileAccessedAt({
        id: fileId,
      }),
    )
  }, [fileId, db])

  // Handle diff error
  if (diffError) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>failed to load diff: {diffError}</p>
      </div>
    )
  }

  // Handle missing editor config (shouldn't happen, but be safe)
  if (!editorConfig) {
    return <LoadingAnimation />
  }

  return (
    <>
      <Editor
        key={key}
        filePath={filePath}
        editorConfig={editorConfig}
        autosaveEnabled={autosaveEnabled}
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

              // Notify Claude Code of selection change

              const selectedText = $isRangeSelection(selection) ? selection.getTextContent() : ""

              const claudeSelection = createRichViewClaudeSelection(selectedText)

              notifyClaudeCodeSelection(selectedText, claudeSelection)
            } else {
              sendFileState({ type: "file.edit" })
              // don't persist state for diff views (read-only overlay)
              if (viewKind && viewKind !== "diff") {
                send({
                  type: "editor.state.update",
                  editorState: {
                    id: editorId,
                    state: Schema.decodeUnknownSync(JsonValue)(editorState.toJSON()),
                    selection: serializedSelection,
                    view_kind: viewKind,
                  },
                })
              }
            }
          })
        }}
        onCodeMirrorSelection={(extendedSelection: EditorExtendedSelection) => {
          send({
            type: "editor.selection.update",
            editorSelection: {
              id: editorId,
              selection: extendedSelection.selection,
            },
          })

          const claudeSelection =
            viewKind === "source"
              ? extendedSelection.claudeSelection
              : createRichViewClaudeSelection(extendedSelection.selectedText)

          notifyClaudeCodeSelection(extendedSelection.selectedText, claudeSelection)
        }}
      />
    </>
  )
}
