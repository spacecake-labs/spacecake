import { editorTable, fileTable, paneTable, workspaceTable } from "@/schema"
import { Database } from "@/services/database"
import { and, desc, eq } from "drizzle-orm"
import { Context } from "effect"

import type { ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"
import { supportsRichView } from "@/lib/language-support"
import { fileTypeFromExtension } from "@/lib/workspace"

type Orm = Context.Tag.Service<typeof Database>["orm"]

async function getViewPreference(
  orm: Orm,
  workspacePath: AbsolutePath,
  filePath: AbsolutePath
): Promise<ViewKind | null> {
  const result = await orm
    .select({ viewKind: editorTable.view_kind })
    .from(editorTable)
    .innerJoin(fileTable, eq(editorTable.file_id, fileTable.id))
    .innerJoin(paneTable, eq(editorTable.pane_id, paneTable.id))
    .innerJoin(workspaceTable, eq(paneTable.workspace_id, workspaceTable.id))
    .where(
      and(eq(workspaceTable.path, workspacePath), eq(fileTable.path, filePath))
    )
    .orderBy(desc(editorTable.id)) // Get the latest element for the file
    .limit(1)

  if (result.length > 0 && result[0].viewKind) {
    return result[0].viewKind
  }
  return null
}

/**
 * Determines the appropriate view for a file based on search params, stored preferences, and file type.
 * This function is now responsible for LOOKING UP the preference, not writing it.
 * The calling context is responsible for persisting the chosen view.
 *
 * @param orm - The Drizzle ORM instance.
 * @param workspacePath - The absolute path of the current workspace.
 * @param filePath - The absolute path of the file.
 * @param viewFromSearch - Optional view from search params (user explicitly selected).
 * @returns The final view to use.
 */
export async function determineView(
  orm: Orm,
  workspacePath: AbsolutePath,
  filePath: AbsolutePath,
  viewFromSearch?: ViewKind
): Promise<ViewKind> {
  const fileType = fileTypeFromExtension(filePath.split(".").pop() || "")
  const defaultView = supportsRichView(fileType) ? "rich" : "source"

  if (viewFromSearch) {
    return viewFromSearch
  }

  const storedView = await getViewPreference(orm, workspacePath, filePath)

  return storedView || defaultView
}

/**
 * Gets the stored view preference for a file.
 *
 * @param orm - The Drizzle ORM instance.
 * @param workspacePath - The absolute path of the current workspace.
 * @param filePath - The absolute path of the file.
 * @returns The stored view preference or null if none exists.
 */
export async function getStoredViewPreference(
  orm: Orm,
  workspacePath: AbsolutePath,
  filePath: AbsolutePath
): Promise<ViewKind | null> {
  return getViewPreference(orm, workspacePath, filePath)
}
