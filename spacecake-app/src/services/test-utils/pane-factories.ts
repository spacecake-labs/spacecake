import { paneItemTable, paneTable, type PaneItemSelect } from "@/schema"
import { EditorPrimaryKey } from "@/schema/editor"
import { FilePrimaryKey } from "@/schema/file"
import {
  PaneItemPrimaryKey,
  PanePrimaryKey,
  type PaneSelect,
} from "@/schema/pane"
import { type WorkspaceSelect } from "@/schema/workspace"
import { Database } from "@/services/database"
import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"

import { ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"

export interface TestPaneSetup {
  workspace: WorkspaceSelect
  pane: PaneSelect
  files: {
    id: FilePrimaryKey
    path: AbsolutePath
  }[]
  editors: {
    id: EditorPrimaryKey
    paneId: PanePrimaryKey
    fileId: FilePrimaryKey
    viewKind: ViewKind
  }[]
  paneItems: PaneItemSelect[]
}

/**
 * Sets up a pane with a specified number of tabs for testing.
 * Uses the actual Database service methods.
 * Must be run with Effect.provide(TestDatabaseLayer).
 */
export const setupPaneWithTabs = (tabCount: number) =>
  Effect.gen(function* () {
    const db = yield* Database

    // Create workspace
    const workspace = yield* db.upsertWorkspace({
      path: AbsolutePath(`/test/workspace-${Date.now()}`),
      is_open: true,
    })

    // Create pane
    const pane = yield* db.upsertPane({
      workspace_id: workspace.id,
      position: 0,
    })

    const files: TestPaneSetup["files"] = []
    const editors: TestPaneSetup["editors"] = []
    const paneItems: PaneItemSelect[] = []

    for (let i = 0; i < tabCount; i++) {
      // Create file
      const file = yield* db.upsertFile()({
        path: AbsolutePath(`/test/file-${i}-${Date.now()}.md`),
        cid: `cid-${i}-${Date.now()}`,
        mtime: new Date().toISOString(),
      })
      files.push({ id: file.id, path: file.path as AbsolutePath })

      // Create editor
      const editor = yield* db.upsertEditor({
        pane_id: pane.id,
        file_id: file.id,
        view_kind: "rich",
      })
      editors.push({
        id: editor.id,
        paneId: pane.id,
        fileId: file.id,
        viewKind: editor.view_kind,
      })

      // Create pane item
      const paneItem = yield* db.insertPaneItem({
        pane_id: pane.id,
        editor_id: editor.id,
        kind: "editor",
        position: i,
      })
      paneItems.push(paneItem)
    }

    // Set the first pane item as active if we have any tabs
    let finalPane = pane
    if (paneItems.length > 0) {
      yield* db.updatePaneActivePaneItem(pane.id, paneItems[0].id)

      // Re-fetch pane to get updated active_pane_item_id
      const rows = yield* db.query((_) =>
        _.select().from(paneTable).where(eq(paneTable.id, pane.id))
      )
      if (rows.length > 0) {
        finalPane = {
          ...pane,
          active_pane_item_id: rows[0]
            .active_pane_item_id as PaneItemPrimaryKey | null,
        }
      }
    }

    return {
      workspace,
      pane: finalPane,
      files,
      editors,
      paneItems,
    } satisfies TestPaneSetup
  })

/**
 * Helper to get all pane items ordered by position.
 * Uses the Database service.
 */
export const getPaneItemsOrderedByPosition = (paneId: PanePrimaryKey) =>
  Effect.gen(function* () {
    const db = yield* Database

    return yield* db.query((_) =>
      _.select()
        .from(paneItemTable)
        .where(eq(paneItemTable.pane_id, paneId))
        .orderBy(asc(paneItemTable.position))
    )
  })

/**
 * Helper to get a pane by id.
 * Uses the Database service.
 */
export const getPane = (paneId: PanePrimaryKey) =>
  Effect.gen(function* () {
    const db = yield* Database

    const rows = yield* db.query((_) =>
      _.select().from(paneTable).where(eq(paneTable.id, paneId))
    )
    return rows.length > 0 ? rows[0] : null
  })
