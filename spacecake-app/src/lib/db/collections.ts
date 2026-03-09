import { createCollection } from "@tanstack/db"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient } from "@tanstack/react-query"

import { fetchDb } from "@/lib/db/fetchers"
import type {
  editorTable,
  fileTable,
  paneItemTable,
  paneTable,
  workspaceTable,
} from "@/schema/drizzle"
import type { WorkspacePrimaryKey } from "@/schema/workspace"
import type { AbsolutePath } from "@/types/workspace"

// row types matching Drizzle's getTableColumns output
export type FileRow = typeof fileTable.$inferSelect
export type PaneRow = typeof paneTable.$inferSelect
export type PaneItemRow = typeof paneItemTable.$inferSelect
export type EditorRow = typeof editorTable.$inferSelect
export type WorkspaceRow = typeof workspaceTable.$inferSelect

export type WorkspaceCollections = ReturnType<typeof createWorkspaceCollections>

/** clean up all collections (stops internal subscriptions) */
export function cleanupCollections(collections: WorkspaceCollections): void {
  collections.fileCollection.cleanup()
  collections.paneCollection.cleanup()
  collections.paneItemCollection.cleanup()
  collections.editorCollection.cleanup()
  collections.workspaceCollection.cleanup()
}

/**
 * creates workspace-scoped TanStack DB collections.
 * each collection fetches all rows for a table scoped to the workspace.
 */
export function createWorkspaceCollections(
  workspacePath: AbsolutePath,
  workspaceId: WorkspacePrimaryKey,
  qc: QueryClient,
) {
  const fileCollection = createCollection<FileRow, string>(
    queryCollectionOptions({
      queryKey: ["files", workspacePath],
      queryFn: () => fetchDb<FileRow[]>("selectAllFiles", workspacePath),
      queryClient: qc,
      getKey: (item) => item.id,
    }),
  )

  const paneCollection = createCollection<PaneRow, string>(
    queryCollectionOptions({
      queryKey: ["panes", workspaceId],
      queryFn: () => fetchDb<PaneRow[]>("selectAllPanes", workspaceId),
      queryClient: qc,
      getKey: (item) => item.id,
    }),
  )

  const paneItemCollection = createCollection<PaneItemRow, string>(
    queryCollectionOptions({
      queryKey: ["pane-items", workspaceId],
      queryFn: () => fetchDb<PaneItemRow[]>("selectAllPaneItems", workspaceId),
      queryClient: qc,
      getKey: (item) => item.id,
    }),
  )

  const editorCollection = createCollection<EditorRow, string>(
    queryCollectionOptions({
      queryKey: ["editors", workspaceId],
      queryFn: () => fetchDb<EditorRow[]>("selectAllEditors", workspaceId),
      queryClient: qc,
      getKey: (item) => item.id,
    }),
  )

  const workspaceCollection = createCollection<WorkspaceRow, string>(
    queryCollectionOptions({
      queryKey: ["workspace", workspaceId],
      queryFn: () => fetchDb<WorkspaceRow[]>("selectWorkspaceById", workspaceId),
      queryClient: qc,
      getKey: (item) => item.id,
    }),
  )

  return {
    fileCollection,
    paneCollection,
    paneItemCollection,
    editorCollection,
    workspaceCollection,
  }
}
