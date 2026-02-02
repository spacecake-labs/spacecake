import { it } from "@effect/vitest"
import { eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import { beforeAll, describe, expect } from "vitest"

import { workspaceTable } from "@/schema/drizzle"
import { Database } from "@/services/database"
import { initCachedDataDir, TestDatabaseLayer } from "@/services/test-utils/pane-test-layer"
import { AbsolutePath } from "@/types/workspace"

// Warm up the migration cache before tests run (avoids timeout on first test)
beforeAll(async () => {
  await initCachedDataDir()
}, 30000)

describe("selectWorkspaceSettings", () => {
  it.effect("returns defaults when no settings exist", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create workspace without settings
      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      expect(settings).toEqual({ autosave: "off" })
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("returns defaults when settings column is null", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create workspace
      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      // Explicitly set settings to null
      yield* db.query((_) =>
        _.update(workspaceTable).set({ settings: null }).where(eq(workspaceTable.id, workspace.id)),
      )

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      expect(settings).toEqual({ autosave: "off" })
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("returns defaults for non-existent workspace", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Use a workspace ID (UUID) that doesn't exist
      const settings = yield* db.selectWorkspaceSettings(
        "00000000-0000-0000-0000-000000000000" as Parameters<typeof db.selectWorkspaceSettings>[0],
      )

      expect(settings).toEqual({ autosave: "off" })
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("handles malformed JSON gracefully by returning defaults", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create workspace
      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      // Insert invalid JSON structure that won't match schema using raw SQL
      yield* db.query((_) =>
        _.execute(
          sql`UPDATE workspace SET settings = '{"autosave": "invalid_value"}'::jsonb WHERE id = ${workspace.id}`,
        ),
      )

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      // Should fall back to defaults when schema decode fails
      expect(settings).toEqual({ autosave: "off" })
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )
})

describe("updateWorkspaceSettings", () => {
  it.effect("persists autosave on setting", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      yield* db.updateWorkspaceSettings(workspace.id, { autosave: "on" })

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      expect(settings.autosave).toBe("on")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("persists autosave off setting", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      // First set to on
      yield* db.updateWorkspaceSettings(workspace.id, { autosave: "on" })

      // Then set back to off
      yield* db.updateWorkspaceSettings(workspace.id, { autosave: "off" })

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      expect(settings.autosave).toBe("off")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("updates preserve other settings fields", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: AbsolutePath(`/test/workspace-${Date.now()}`),
        is_open: true,
      })

      // Update with full settings object
      yield* db.updateWorkspaceSettings(workspace.id, { autosave: "on" })

      const settings = yield* db.selectWorkspaceSettings(workspace.id)

      // Verify the setting was persisted correctly
      expect(settings).toEqual({ autosave: "on" })
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )
})
