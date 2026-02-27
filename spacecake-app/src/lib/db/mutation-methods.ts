import type { DatabaseMethodName } from "@/services/database"

/**
 * single source of truth for which database methods are mutations.
 * maps each mutation to the TanStack Query key prefixes it should invalidate.
 *
 * imported by:
 * - ipc.ts (main process) to decide when to send db:invalidate events
 * - invalidation.ts (renderer) to map mutations to cache invalidation
 */
export const MUTATION_INVALIDATION_MAP: Partial<Record<DatabaseMethodName, readonly string[]>> = {
  upsertWorkspace: ["workspace"],
  upsertFile: ["files"],
  updateFileAccessedAt: ["files"],
  upsertPane: ["panes"],
  insertPaneItem: ["pane-items", "panes"],
  closePaneItemAndGetNext: ["pane-items", "panes", "editors"],
  updatePaneItemAccessedAt: ["pane-items"],
  activatePaneItem: ["pane-items", "panes"],
  updatePaneActivePaneItem: ["panes"],
  updateWorkspaceActivePane: ["workspace"],
  activateEditorInPane: ["pane-items", "panes", "editors", "workspace"],
  upsertEditor: ["editors"],
  updateEditorAccessedAt: ["pane-items"],
  updateEditorState: ["editors"],
  updateEditorViewKind: ["editors", "pane-items"],
  updateEditorSelection: [],
  deleteFile: ["files", "pane-items", "editors"],
  clearEditorStatesForFile: ["editors"],
  updateWorkspaceLayout: ["workspace"],
  updateWorkspaceSettings: ["workspace"],
}

/** set of mutation method names — derived from MUTATION_INVALIDATION_MAP */
export const MUTATION_METHOD_NAMES = new Set(Object.keys(MUTATION_INVALIDATION_MAP))
