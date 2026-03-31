import { createFileRoute, ErrorComponent, redirect } from "@tanstack/react-router"
import { useActorRef } from "@xstate/react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { atom } from "jotai"
import { useSetAtom, useAtomValue } from "jotai"
import { $getSelection, $isRangeSelection, type EditorState } from "lexical"
import React, { useEffect } from "react"

import { Editor } from "@/components/editor/editor"
import { ConflictEditor } from "@/components/editor/plugins/conflict-editor"
import { LoadingAnimation } from "@/components/loading-animation"
import { useHotkey } from "@/hooks/use-hotkey"
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings"
import { expandedFoldersAtom, fileTreeAtom } from "@/lib/atoms/atoms"
import {
  getOrCreateFileStateAtom,
  findFolderInTree,
  sortTree,
  updateFolderInTree,
} from "@/lib/atoms/file-tree"
import { activeBlameAtom, activeLineDiffAtom, isGitRepoAtom } from "@/lib/atoms/git"
import { searchActorAtom } from "@/lib/atoms/search"
import { getFoldersToExpand } from "@/lib/auto-reveal"
import {
  createEditorConfigFromContent,
  createEditorConfigFromDiff,
  createEditorConfigFromState,
} from "@/lib/editor"
import { readDirectory } from "@/lib/fs"
import { createRichViewClaudeSelection } from "@/lib/selection-utils"
import { store } from "@/lib/store"
import { decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { fileMachine } from "@/machines/manage-file"
import { router } from "@/router"
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
  // set by pane machine to signal that pane item activation was already handled
  paneActivated: Schema.optional(Schema.Boolean),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) => Schema.decodeUnknownSync(fileSearchSchema)(search),
  loaderDeps: ({ search: { view, editorId, baseRef, targetRef, paneActivated } }) => ({
    view,
    editorId,
    baseRef,
    targetRef,
    paneActivated,
  }),
  loader: async ({
    params,
    deps: { view, editorId, baseRef, targetRef, paneActivated },
    context,
  }) => {
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
                children: sortTree(children),
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
        // start pane activation early - don't block subsequent work
        const activationPromise = !paneActivated
          ? RuntimeClient.runPromise(
              Effect.gen(function* () {
                const db = yield* Database
                yield* db.activateEditorInPane(result.content.data.editorId, paneId)
              }),
            )
          : Promise.resolve()

        // add view to search params if it is not present
        if (!view) {
          await activationPromise
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
        const epoch = store.get(getOrCreateFileStateAtom(filePath)).context.epoch
        const key = `${filePath}-${result.viewKind}-${cid}-${epoch}`

        // Handle diff view - fetch git diff data and create diff editor config
        // parallelize activation with diff fetch since they're independent
        if (result.viewKind === "diff") {
          const relativePath = filePath.startsWith(workspace.path + "/")
            ? filePath.slice(workspace.path.length + 1)
            : filePath

          const [, diffResult] = await Promise.all([
            activationPromise,
            window.electronAPI.git.getFileDiff(workspace.path, relativePath, baseRef, targetRef),
          ])

          return match(diffResult, {
            onLeft: (error) => ({
              filePath,
              editorConfig: null,
              key,
              editorId: result.content.data.editorId,
              fileId: result.content.data.fileId,
              diffError: error.description,
              conflictContent: null,
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
                conflictContent: null,
              }
            },
          })
        }

        // handle conflict view - fetch merge stage content
        if (result.viewKind === "conflict") {
          const relativePath = filePath.startsWith(workspace.path + "/")
            ? filePath.slice(workspace.path.length + 1)
            : filePath

          const [, conflictResult] = await Promise.all([
            activationPromise,
            window.electronAPI.git.getConflictContent(workspace.path, relativePath),
          ])

          return match(conflictResult, {
            onLeft: (error) => ({
              filePath,
              editorConfig: null,
              key,
              editorId: result.content.data.editorId,
              fileId: result.content.data.fileId,
              diffError: error.description,
              conflictContent: null,
            }),
            onRight: (conflict) => ({
              filePath,
              editorConfig: null,
              key,
              editorId: result.content.data.editorId,
              fileId: result.content.data.fileId,
              diffError: null,
              conflictContent: conflict,
            }),
          })
        }

        // ensure activation completes before returning for non-diff views
        await activationPromise

        // handle source/rich view (diff and conflict are already handled above)
        const persistableViewKind = result.viewKind as "rich" | "source"
        const editorConfig =
          result.content.kind === "state"
            ? createEditorConfigFromState(result.content.data.state, result.content.data.selection)
            : createEditorConfigFromContent(
                result.content.data,
                persistableViewKind,
                result.content.data.selection,
              )

        return {
          filePath,
          editorConfig,
          key,
          editorId: result.content.data.editorId,
          fileId: result.content.data.fileId,
          diffError: null,
          conflictContent: null,
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
  const { filePath, editorConfig, key, editorId, fileId, diffError, conflictContent } =
    Route.useLoaderData()
  const { db, workspace } = Route.useRouteContext()
  const { view: viewKind } = Route.useSearch()

  const sendFileState = useSetAtom(getOrCreateFileStateAtom(filePath))

  const send = useActorRef(fileMachine).send

  // Get workspace settings for autosave (not used for diff view since it's read-only)
  const { settings } = useWorkspaceSettings(workspace.id)
  const autosaveEnabled =
    viewKind !== "diff" && viewKind !== "conflict" && settings.autosave === "on"

  // open unified in-file search (works in both rich and source mode).
  // sends search.open directly to the machine — the machine is the single
  // source of truth. re-opening while already open increments focusTrigger.
  useHotkey(
    "mod+f",
    () => {
      const actor = store.get(searchActorAtom)
      if (actor) actor.send({ type: "search.open" })
    },
    { capture: true },
  )

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

  // fetch blame data for the active file
  const setActiveBlame = useSetAtom(activeBlameAtom)
  const isGitRepo = useAtomValue(isGitRepoAtom)
  const isFileDirty = useAtomValue(
    React.useMemo(
      () => atom((get) => get(getOrCreateFileStateAtom(filePath)).value === "Dirty"),
      [filePath],
    ),
  )

  useEffect(() => {
    if (!isGitRepo || isFileDirty) {
      setActiveBlame([])
      return
    }

    const relativePath = filePath.startsWith(workspace.path + "/")
      ? filePath.slice(workspace.path.length + 1)
      : filePath

    let cancelled = false
    window.electronAPI.git
      .blame(workspace.path, relativePath)
      .then((result) => {
        if (cancelled) return
        match(result, {
          onLeft: () => setActiveBlame([]),
          onRight: (data) => setActiveBlame(data),
        })
      })
      .catch(() => {
        if (!cancelled) setActiveBlame([])
      })

    return () => {
      cancelled = true
    }
  }, [filePath, workspace.path, isGitRepo, isFileDirty, setActiveBlame])

  // clear active blame on unmount
  useEffect(() => {
    return () => setActiveBlame([])
  }, [setActiveBlame])

  // fetch line diff data for the active file
  const setActiveLineDiff = useSetAtom(activeLineDiffAtom)

  useEffect(() => {
    if (!isGitRepo || isFileDirty) {
      setActiveLineDiff([])
      return
    }

    const relativePath = filePath.startsWith(workspace.path + "/")
      ? filePath.slice(workspace.path.length + 1)
      : filePath

    let cancelled = false
    window.electronAPI.git
      .getLineDiff(workspace.path, relativePath)
      .then((result) => {
        if (cancelled) return
        match(result, {
          onLeft: () => setActiveLineDiff([]),
          onRight: (data) => setActiveLineDiff(data),
        })
      })
      .catch(() => {
        if (!cancelled) setActiveLineDiff([])
      })

    return () => {
      cancelled = true
    }
  }, [filePath, workspace.path, isGitRepo, isFileDirty, setActiveLineDiff])

  // clear line diff on unmount
  useEffect(() => {
    return () => setActiveLineDiff([])
  }, [setActiveLineDiff])

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

  // handle conflict view
  if (conflictContent) {
    const extension = filePath.split(".").pop() || ""
    return (
      <ConflictEditor
        ours={conflictContent.ours}
        theirs={conflictContent.theirs}
        filePath={filePath}
        workspacePath={workspace.path}
        language={extension}
        onResolved={() => {
          router.navigate({
            to: "/w/$workspaceId/f/$filePath",
            params: {
              workspaceId: encodeBase64Url(workspace.path),
              filePath: encodeBase64Url(filePath),
            },
            search: { view: "source" },
          })
        }}
      />
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
              // don't persist state for ephemeral views (diff/conflict overlays)
              if (viewKind && viewKind !== "diff" && viewKind !== "conflict") {
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
