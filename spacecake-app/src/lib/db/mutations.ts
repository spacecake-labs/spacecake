import type { EditorInsert, EditorSelectionUpdate, EditorStateUpdate, FileInsert } from "@/schema"
import type {
  EditorPrimaryKey,
  EditorSelect,
  EditorStateWithFileIdSelectSchema,
} from "@/schema/editor"
import type { FileSelect } from "@/schema/file"
import type { PaneItemPrimaryKey, PanePrimaryKey } from "@/schema/pane"
import type { WorkspacePrimaryKey } from "@/schema/workspace"
import type { WorkspaceLayout } from "@/schema/workspace-layout"
import type { WorkspaceSettings } from "@/schema/workspace-settings"
import type { Maybe } from "@/types/adt"
import type { PersistableViewKind, SerializedSelection } from "@/types/lexical"
import type { AbsolutePath } from "@/types/workspace"

import { fetchDb } from "@/lib/db/fetchers"

type EditorStateWithFileId = typeof EditorStateWithFileIdSelectSchema.Type
type EditorStateWithFileIdFlat = Omit<EditorStateWithFileId, "selection"> & {
  selection: SerializedSelection | null
}

// --- compound mutations (IPC call, invalidation is automatic via db:invalidate channel) ---

export const closePaneItemAndGetNext = (
  paneItemId: PaneItemPrimaryKey,
  isClosingActiveTab: boolean,
) =>
  fetchDb<
    Maybe<{
      id: string
      editorId: string
      filePath: string
      viewKind: PersistableViewKind
    }>
  >("closePaneItemAndGetNext", paneItemId, isClosingActiveTab)

export const activateEditorInPane = (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
  fetchDb<string>("activateEditorInPane", editorId, paneId)

export const activatePaneItem = (paneId: PanePrimaryKey, paneItemId: PaneItemPrimaryKey) =>
  fetchDb("activatePaneItem", paneId, paneItemId)

export const upsertFile = (input: FileInsert) => fetchDb<FileSelect>("upsertFile", input)

export const upsertEditor = (input: EditorInsert) => fetchDb<EditorSelect>("upsertEditor", input)

export const updateEditorState = (input: EditorStateUpdate) => fetchDb("updateEditorState", input)

export const updateEditorSelection = (input: EditorSelectionUpdate) =>
  fetchDb("updateEditorSelection", input)

export const clearEditorStatesForFile = (filePath: AbsolutePath) =>
  fetchDb("clearEditorStatesForFile", filePath)

export const updateWorkspaceLayout = (workspaceId: WorkspacePrimaryKey, layout: WorkspaceLayout) =>
  fetchDb("updateWorkspaceLayout", workspaceId, layout)

export const updateWorkspaceSettings = (
  workspaceId: WorkspacePrimaryKey,
  settings: WorkspaceSettings,
) => fetchDb("updateWorkspaceSettings", workspaceId, settings)

export const deleteFile = (filePath: AbsolutePath) => fetchDb("deleteFile", filePath)

// --- read queries still needed for compound operations ---

export const selectLatestEditorStateForFile = (filePath: AbsolutePath) =>
  fetchDb<Maybe<EditorStateWithFileIdFlat>>("selectLatestEditorStateForFile", filePath)

export const selectFile = (filePath: AbsolutePath) => fetchDb("selectFile", filePath)
