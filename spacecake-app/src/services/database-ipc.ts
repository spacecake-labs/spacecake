import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type {
  EditorInsert,
  EditorSelectionUpdate,
  EditorStateUpdate,
  FileInsert,
  FileUpdate,
  PaneInsert,
  PaneItemInsert,
  WorkspaceInsert,
  WorkspaceLayout,
} from "@/schema"
import type { WorkspaceSettings } from "@/schema/workspace-settings"
import type { PersistableViewKind } from "@/types/lexical"

import { EditorPrimaryKey } from "@/schema/editor"
import { PaneItemPrimaryKey, PanePrimaryKey } from "@/schema/pane"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import {
  Database,
  PgliteError,
  type DatabaseMethodName,
  type DatabaseMethods,
} from "@/services/database"
import { AbsolutePath } from "@/types/workspace"

/**
 * invokes a Database method on the main process via IPC.
 * returns an Effect that fails with PgliteError on error.
 */
const invokeDb = <T>(
  method: DatabaseMethodName,
  ...args: unknown[]
): Effect.Effect<T, PgliteError> =>
  Effect.tryPromise({
    try: () => window.electronAPI.db.invoke(method, ...args),
    catch: (e) => new PgliteError({ cause: e }),
  }).pipe(
    Effect.flatMap((result) =>
      result._tag === "Left"
        ? Effect.fail(new PgliteError({ cause: result.value.cause }))
        : Effect.succeed(result.value as T),
    ),
  )

/**
 * typed proxy — TypeScript checks every method signature against DatabaseMethods.
 * each method is listed once with args properly forwarded.
 */
const methods = {
  selectWorkspaceCache: (workspacePath: AbsolutePath) =>
    invokeDb("selectWorkspaceCache", workspacePath),
  selectLastOpenedWorkspace: () => invokeDb("selectLastOpenedWorkspace"),
  upsertWorkspace: (input: WorkspaceInsert) => invokeDb("upsertWorkspace", input),
  upsertFile: (input: FileInsert) => invokeDb("upsertFile", input),
  updateFileAccessedAt: (input: FileUpdate) => invokeDb("updateFileAccessedAt", input),
  upsertPane: (input: PaneInsert) => invokeDb("upsertPane", input),
  insertPaneItem: (input: PaneItemInsert) => invokeDb("insertPaneItem", input),
  closePaneItemAndGetNext: (paneItemId: PaneItemPrimaryKey, isClosingActiveTab: boolean) =>
    invokeDb("closePaneItemAndGetNext", paneItemId, isClosingActiveTab),
  updatePaneItemAccessedAt: (paneItemId: PaneItemPrimaryKey) =>
    invokeDb("updatePaneItemAccessedAt", paneItemId),
  activatePaneItem: (paneId: PanePrimaryKey, paneItemId: PaneItemPrimaryKey) =>
    invokeDb("activatePaneItem", paneId, paneItemId),
  selectActivePaneItemForPane: (paneId: PanePrimaryKey) =>
    invokeDb("selectActivePaneItemForPane", paneId),
  updatePaneActivePaneItem: (paneId: PanePrimaryKey, paneItemId: PaneItemPrimaryKey | null) =>
    invokeDb("updatePaneActivePaneItem", paneId, paneItemId),
  updateWorkspaceActivePane: (workspaceId: WorkspacePrimaryKey, paneId: PanePrimaryKey | null) =>
    invokeDb("updateWorkspaceActivePane", workspaceId, paneId),
  activateEditorInPane: (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
    invokeDb("activateEditorInPane", editorId, paneId),
  upsertEditor: (input: EditorInsert) => invokeDb("upsertEditor", input),
  updateEditorAccessedAt: (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
    invokeDb("updateEditorAccessedAt", editorId, paneId),
  updateEditorState: (input: EditorStateUpdate) => invokeDb("updateEditorState", input),
  updateEditorViewKind: (editorId: EditorPrimaryKey, viewKind: PersistableViewKind) =>
    invokeDb("updateEditorViewKind", editorId, viewKind),
  updateEditorSelection: (input: EditorSelectionUpdate) => invokeDb("updateEditorSelection", input),
  deleteFile: (filePath: AbsolutePath) => invokeDb("deleteFile", filePath),
  selectLastOpenedFile: () => invokeDb("selectLastOpenedFile"),
  selectFile: (filePath: AbsolutePath) => invokeDb("selectFile", filePath),
  selectActiveEditorForWorkspace: (workspacePath: AbsolutePath) =>
    invokeDb("selectActiveEditorForWorkspace", workspacePath),
  selectLatestEditorStateForFile: (filePath: AbsolutePath) =>
    invokeDb("selectLatestEditorStateForFile", filePath),
  clearEditorStatesForFile: (filePath: AbsolutePath) =>
    invokeDb("clearEditorStatesForFile", filePath),
  selectEditorStateById: (editorId: EditorPrimaryKey) =>
    invokeDb("selectEditorStateById", editorId),
  updateWorkspaceLayout: (workspaceId: WorkspacePrimaryKey, layout: WorkspaceLayout) =>
    invokeDb("updateWorkspaceLayout", workspaceId, layout),
  updateWorkspaceSettings: (workspaceId: WorkspacePrimaryKey, settings: WorkspaceSettings) =>
    invokeDb("updateWorkspaceSettings", workspaceId, settings),
  selectWorkspaceSettings: (workspaceId: WorkspacePrimaryKey) =>
    invokeDb("selectWorkspaceSettings", workspaceId),
  selectWorkspaceLayoutRaw: (workspaceId: WorkspacePrimaryKey) =>
    invokeDb("selectWorkspaceLayoutRaw", workspaceId),
  selectWorkspaceSettingsRaw: (workspaceId: WorkspacePrimaryKey) =>
    invokeDb("selectWorkspaceSettingsRaw", workspaceId),
  selectPaneItems: (paneId: PanePrimaryKey) => invokeDb("selectPaneItems", paneId),
  selectActivePaneItemId: (paneId: PanePrimaryKey) => invokeDb("selectActivePaneItemId", paneId),
  selectRecentFiles: (workspacePath: AbsolutePath) => invokeDb("selectRecentFiles", workspacePath),
  selectActiveEditorRaw: (workspacePath: AbsolutePath) =>
    invokeDb("selectActiveEditorRaw", workspacePath),
  selectAllFiles: (workspacePath: AbsolutePath) => invokeDb("selectAllFiles", workspacePath),
  selectAllPanes: (workspaceId: WorkspacePrimaryKey) => invokeDb("selectAllPanes", workspaceId),
  selectAllPaneItems: (workspaceId: WorkspacePrimaryKey) =>
    invokeDb("selectAllPaneItems", workspaceId),
  selectAllEditors: (workspaceId: WorkspacePrimaryKey) => invokeDb("selectAllEditors", workspaceId),
  selectWorkspaceById: (workspaceId: WorkspacePrimaryKey) =>
    invokeDb("selectWorkspaceById", workspaceId),
  selectEditorsWithCachedState: (workspacePath: AbsolutePath) =>
    invokeDb("selectEditorsWithCachedState", workspacePath),
} satisfies DatabaseMethods

const ipcUnavailable = (name: string): never => {
  throw new Error(`${name} is not available in the renderer — use IPC`)
}

type DatabaseService = typeof Database.Service

/**
 * renderer-side Database layer that proxies all calls to main process via IPC.
 * registers as the same "Database" service tag so all `yield* Database` resolves here.
 */
export const DatabaseIpcLayer: Layer.Layer<Database> = Layer.succeed(
  Database,
  Object.defineProperties(
    { ...methods },
    {
      client: { get: () => ipcUnavailable("client") },
      orm: { get: () => ipcUnavailable("orm") },
      query: { get: () => ipcUnavailable("query") },
    },
  ) as unknown as DatabaseService,
)
