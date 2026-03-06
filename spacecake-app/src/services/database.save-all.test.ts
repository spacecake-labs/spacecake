import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { beforeAll, describe, expect } from "vitest"

import { EditorPrimaryKey } from "@/schema/editor"
import { Database } from "@/services/database"
import { setupPaneWithTabs } from "@/services/test-utils/pane-factories"
import { initCachedDataDir, TestDatabaseLayer } from "@/services/test-utils/pane-test-layer"
import { AbsolutePath } from "@/types/workspace"

// warm up the migration cache before tests run (avoids timeout on first test)
beforeAll(async () => {
  await initCachedDataDir()
}, 30000)

describe("selectEditorsWithCachedState", () => {
  it.effect("returns editors that have cached state", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { editors, files } = yield* setupPaneWithTabs(3)

      // set state on editors 0 and 2, leave editor 1 without state
      const dummyState = { root: { children: [] } }
      yield* db.updateEditorState({
        id: editors[0].id,
        state: dummyState,
        selection: null,
        view_kind: "rich",
      })
      yield* db.updateEditorState({
        id: editors[2].id,
        state: dummyState,
        selection: null,
        view_kind: "source",
      })

      // query using the workspace path prefix
      const workspacePath = AbsolutePath("/test")
      const results = yield* db.selectEditorsWithCachedState(workspacePath)

      // should return exactly the 2 editors with state
      expect(results.length).toBe(2)
      const resultEditorIds = results.map((r) => r.editorId).sort()
      const expectedIds = [editors[0].id, editors[2].id].sort()
      expect(resultEditorIds).toEqual(expectedIds)

      // verify file paths are present
      const resultPaths = results.map((r) => r.filePath).sort()
      const expectedPaths = [files[0].path, files[2].path].sort()
      expect(resultPaths).toEqual(expectedPaths)

      // verify view_kind is correct
      const sourceEditor = results.find((r) => r.editorId === editors[2].id)
      expect(sourceEditor?.view_kind).toBe("source")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("returns empty array when no editors have cached state", () =>
    Effect.gen(function* () {
      const db = yield* Database
      yield* setupPaneWithTabs(2)

      const workspacePath = AbsolutePath("/test")
      const results = yield* db.selectEditorsWithCachedState(workspacePath)

      expect(results.length).toBe(0)
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("filters by workspace path prefix", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // create two workspaces with different paths
      const ws1 = yield* db.upsertWorkspace({
        path: AbsolutePath("/workspace-a"),
        is_open: true,
      })
      const ws2 = yield* db.upsertWorkspace({
        path: AbsolutePath("/workspace-b"),
        is_open: true,
      })

      const pane1 = yield* db.upsertPane({ workspace_id: ws1.id, position: 0 })
      const pane2 = yield* db.upsertPane({ workspace_id: ws2.id, position: 0 })

      const file1 = yield* db.upsertFile({
        path: AbsolutePath("/workspace-a/file.md"),
        cid: "cid-a",
        mtime: new Date().toISOString(),
      })
      const file2 = yield* db.upsertFile({
        path: AbsolutePath("/workspace-b/file.md"),
        cid: "cid-b",
        mtime: new Date().toISOString(),
      })

      const editor1 = yield* db.upsertEditor({
        pane_id: pane1.id,
        file_id: file1.id,
        view_kind: "rich",
      })
      const editor2 = yield* db.upsertEditor({
        pane_id: pane2.id,
        file_id: file2.id,
        view_kind: "rich",
      })

      // set state on both
      const dummyState = { root: { children: [] } }
      yield* db.updateEditorState({
        id: editor1.id,
        state: dummyState,
        selection: null,
        view_kind: "rich",
      })
      yield* db.updateEditorState({
        id: editor2.id,
        state: dummyState,
        selection: null,
        view_kind: "rich",
      })

      // query only workspace-a
      const results = yield* db.selectEditorsWithCachedState(AbsolutePath("/workspace-a"))

      expect(results.length).toBe(1)
      expect(results[0].editorId).toBe(editor1.id)
      expect(results[0].filePath).toBe("/workspace-a/file.md")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("excludes editors whose state was cleared", () =>
    Effect.gen(function* () {
      const db = yield* Database
      const { editors, files } = yield* setupPaneWithTabs(2)

      // set state on both editors
      const dummyState = { root: { children: [] } }
      yield* db.updateEditorState({
        id: editors[0].id,
        state: dummyState,
        selection: null,
        view_kind: "rich",
      })
      yield* db.updateEditorState({
        id: editors[1].id,
        state: dummyState,
        selection: null,
        view_kind: "rich",
      })

      // clear state for file 0 (simulates a save)
      yield* db.clearEditorStatesForFile(files[0].path)

      const results = yield* db.selectEditorsWithCachedState(AbsolutePath("/test"))

      expect(results.length).toBe(1)
      expect(results[0].editorId).toBe(editors[1].id)
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )
})
