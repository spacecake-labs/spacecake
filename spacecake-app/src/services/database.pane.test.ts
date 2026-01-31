import { paneItemTable } from "@/schema/drizzle"
import { PaneItemPrimaryKey } from "@/schema/pane"
import { Database } from "@/services/database"
import {
  getPane,
  getPaneItemsOrderedByPosition,
  setupPaneWithTabs,
} from "@/services/test-utils/pane-factories"
import {
  initCachedDataDir,
  TestDatabaseLayer,
} from "@/services/test-utils/pane-test-layer"
import { it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Option } from "effect"
import { beforeAll, describe, expect } from "vitest"

import { AbsolutePath } from "@/types/workspace"

// Warm up the migration cache before tests run (avoids timeout on first test)
beforeAll(async () => {
  await initCachedDataDir()
}, 30000)

describe("activateEditorInPane", () => {
  it.effect("creates new paneItem when editor not in pane", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane } = yield* setupPaneWithTabs(0)

      // Create a file and editor that doesn't have a paneItem yet
      const file = yield* db.upsertFile()({
        path: AbsolutePath("/test/new-file.md"),
        cid: "cid-new",
        mtime: new Date().toISOString(),
      })
      const editor = yield* db.upsertEditor({
        pane_id: pane.id,
        file_id: file.id,
        view_kind: "rich",
      })

      // Activate the editor
      const paneItemId = yield* db.activateEditorInPane(editor.id, pane.id)

      // Verify paneItem was created
      const items = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(items.length).toBe(1)
      expect(items[0].id).toBe(paneItemId)
      expect(items[0].editor_id).toBe(editor.id)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("reuses existing paneItem when editor already in pane", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, editors, paneItems } = yield* setupPaneWithTabs(1)
      const originalPaneItemId = paneItems[0].id

      // Activate the same editor again
      const paneItemId = yield* db.activateEditorInPane(editors[0].id, pane.id)

      // Should return same paneItem id
      expect(paneItemId).toBe(originalPaneItemId)

      // Should still only have one paneItem
      const items = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(items.length).toBe(1)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("sets pane.active_pane_item_id to activated item", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane } = yield* setupPaneWithTabs(0)

      const file = yield* db.upsertFile()({
        path: AbsolutePath("/test/new-file.md"),
        cid: "cid-new",
        mtime: new Date().toISOString(),
      })
      const editor = yield* db.upsertEditor({
        pane_id: pane.id,
        file_id: file.id,
        view_kind: "rich",
      })

      const paneItemId = yield* db.activateEditorInPane(editor.id, pane.id)

      const updatedPane = yield* getPane(pane.id)
      expect(updatedPane?.active_pane_item_id).toBe(paneItemId)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("assigns next position for new items", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane } = yield* setupPaneWithTabs(2)

      // Create and activate a new editor
      const file = yield* db.upsertFile()({
        path: AbsolutePath("/test/new-file.md"),
        cid: "cid-new",
        mtime: new Date().toISOString(),
      })
      const editor = yield* db.upsertEditor({
        pane_id: pane.id,
        file_id: file.id,
        view_kind: "rich",
      })

      yield* db.activateEditorInPane(editor.id, pane.id)

      // Check positions
      const items = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(items.length).toBe(3)
      expect(items[0].position).toBe(0)
      expect(items[1].position).toBe(1)
      expect(items[2].position).toBe(2)
      expect(items[2].editor_id).toBe(editor.id)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect(
    "updates last_accessed_at on existing items without changing position",
    () =>
      Effect.gen(function* () {
        const db = yield* Database
        const { pane, editors, paneItems } = yield* setupPaneWithTabs(3)

        // Get original state of first pane item
        const originalItem = paneItems[0]

        // Activate the first editor again (already has pane item at position 0)
        yield* db.activateEditorInPane(editors[0].id, pane.id)

        // Check position hasn't changed
        const items = yield* getPaneItemsOrderedByPosition(pane.id)
        const updatedItem = items.find((i) => i.id === originalItem.id)
        expect(updatedItem?.position).toBe(0)

        // last_accessed_at should still be set (it was updated during upsert)
        expect(updatedItem?.last_accessed_at).toBeTruthy()
      }).pipe(Effect.provide(TestDatabaseLayer))
  )
})

describe("closePaneItemAndGetNext", () => {
  it.effect("deletes the pane item from database", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(3)
      const itemToClose = paneItems[1]

      yield* db.closePaneItemAndGetNext(
        itemToClose.id as PaneItemPrimaryKey,
        false
      )

      const items = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(items.length).toBe(2)
      expect(items.find((i) => i.id === itemToClose.id)).toBeUndefined()
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("recompacts positions when closing middle tab", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(3)

      // Close middle tab (position 1)
      yield* db.closePaneItemAndGetNext(
        paneItems[1].id as PaneItemPrimaryKey,
        false
      )

      const items = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(items.length).toBe(2)
      expect(items[0].position).toBe(0)
      expect(items[1].position).toBe(1)

      // Verify correct items remain
      expect(items[0].id).toBe(paneItems[0].id)
      expect(items[1].id).toBe(paneItems[2].id)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect(
    "returns next active based on last_accessed_at when closing active",
    () =>
      Effect.gen(function* () {
        const db = yield* Database
        const { pane, paneItems } = yield* setupPaneWithTabs(3)

        // Update access times with explicit timestamps to control ordering
        const now = new Date()
        const older = new Date(now.getTime() - 1000)
        const newest = new Date(now.getTime() + 1000)

        yield* db.query((_) =>
          _.update(paneItemTable)
            .set({ last_accessed_at: older.toISOString() })
            .where(eq(paneItemTable.id, paneItems[0].id))
        )

        yield* db.query((_) =>
          _.update(paneItemTable)
            .set({ last_accessed_at: newest.toISOString() })
            .where(eq(paneItemTable.id, paneItems[1].id))
        )

        // Set paneItems[2] as active
        yield* db.updatePaneActivePaneItem(
          pane.id,
          paneItems[2].id as PaneItemPrimaryKey
        )

        // Close active tab (paneItems[2])
        const result = yield* db.closePaneItemAndGetNext(
          paneItems[2].id as PaneItemPrimaryKey,
          true
        )

        // Should return paneItems[1] as next active (most recently accessed remaining)
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(paneItems[1].id)
        }
      }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("returns Option.none when closing last tab", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(1)

      const result = yield* db.closePaneItemAndGetNext(
        paneItems[0].id as PaneItemPrimaryKey,
        true
      )

      expect(Option.isNone(result)).toBe(true)

      // Pane should have no active item
      const updatedPane = yield* getPane(pane.id)
      expect(updatedPane?.active_pane_item_id).toBeNull()
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("does not change active pointer when closing non-active tab", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(3)

      // Set paneItems[0] as active
      yield* db.updatePaneActivePaneItem(
        pane.id,
        paneItems[0].id as PaneItemPrimaryKey
      )

      // Close non-active tab (paneItems[2])
      const result = yield* db.closePaneItemAndGetNext(
        paneItems[2].id as PaneItemPrimaryKey,
        false
      )

      // Should return none (we're not changing active)
      expect(Option.isNone(result)).toBe(true)

      // Active pointer should remain unchanged
      const updatedPane = yield* getPane(pane.id)
      expect(updatedPane?.active_pane_item_id).toBe(paneItems[0].id)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )
})

describe("updatePaneItemAccessedAt", () => {
  it.effect("updates the last_accessed_at timestamp", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(1)

      // Set to a known old timestamp (format matches PostgreSQL timestamp)
      const oldTime = "2020-01-01 00:00:00"
      yield* db.query((_) =>
        _.update(paneItemTable)
          .set({ last_accessed_at: oldTime })
          .where(eq(paneItemTable.id, paneItems[0].id))
      )

      // Verify it was set
      const midItems = yield* getPaneItemsOrderedByPosition(pane.id)
      expect(midItems[0].last_accessed_at).toBe(oldTime)

      // Update access time
      yield* db.updatePaneItemAccessedAt(paneItems[0].id as PaneItemPrimaryKey)

      const afterItems = yield* getPaneItemsOrderedByPosition(pane.id)

      // Should be updated to a different (newer) timestamp
      expect(afterItems[0].last_accessed_at).not.toBe(oldTime)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )
})

describe("updatePaneActivePaneItem", () => {
  it.effect("updates active_pane_item_id pointer", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(3)

      // Initially active should be paneItems[0]
      expect(pane.active_pane_item_id).toBe(paneItems[0].id)

      // Update to paneItems[2]
      yield* db.updatePaneActivePaneItem(
        pane.id,
        paneItems[2].id as PaneItemPrimaryKey
      )

      const updatedPane = yield* getPane(pane.id)
      expect(updatedPane?.active_pane_item_id).toBe(paneItems[2].id)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("can set active to null", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(1)

      // Initially active should be set
      expect(pane.active_pane_item_id).toBe(paneItems[0].id)

      // Set to null
      yield* db.updatePaneActivePaneItem(pane.id, null)

      const updatedPane = yield* getPane(pane.id)
      expect(updatedPane?.active_pane_item_id).toBeNull()
    }).pipe(Effect.provide(TestDatabaseLayer))
  )
})

describe("selectActivePaneItemForPane", () => {
  it.effect("returns active pane item when one is set", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane, paneItems } = yield* setupPaneWithTabs(2)

      const active = yield* db.selectActivePaneItemForPane(pane.id)

      expect(Option.isSome(active)).toBe(true)
      if (Option.isSome(active)) {
        expect(active.value.id).toBe(paneItems[0].id)
      }
    }).pipe(Effect.provide(TestDatabaseLayer))
  )

  it.effect("returns Option.none when no active item is set", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { pane } = yield* setupPaneWithTabs(0)

      const active = yield* db.selectActivePaneItemForPane(pane.id)

      expect(Option.isNone(active)).toBe(true)
    }).pipe(Effect.provide(TestDatabaseLayer))
  )
})
