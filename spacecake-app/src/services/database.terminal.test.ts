import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { beforeAll, describe, expect } from "vitest"

import { WorkspacePrimaryKey } from "@/schema/workspace"
import { Database } from "@/services/database"
import { initCachedDataDir, TestDatabaseLayer } from "@/services/test-utils/pane-test-layer"

// warm up the migration cache before tests run (avoids timeout on first test)
beforeAll(async () => {
  await initCachedDataDir()
}, 30000)

describe("Terminal persistence", () => {
  it.effect("insertTerminal saves cwd_path and selectTerminalsForWorkspace retrieves it", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create a workspace first
      const workspace = yield* db.upsertWorkspace({
        path: "/test/workspace",
        is_open: true,
      })
      const workspaceId = workspace.id as WorkspacePrimaryKey

      // Insert terminals with different cwds
      yield* db.insertTerminal({
        workspace_id: workspaceId,
        cwd_path: "/home/user/projects/app",
      })

      yield* db.insertTerminal({
        workspace_id: workspaceId,
        cwd_path: "/var/log",
      })

      // Query terminals for the workspace
      const terminals = yield* db.selectTerminalsForWorkspace(workspaceId)

      // Verify both terminals are returned with correct cwd_path
      expect(terminals).toHaveLength(2)

      const cwdPaths = terminals.map((t) => t.cwd_path).sort()
      expect(cwdPaths).toEqual(["/home/user/projects/app", "/var/log"])
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("terminals are isolated per workspace", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create two workspaces
      const workspace1 = yield* db.upsertWorkspace({
        path: "/test/ws1",
        is_open: true,
      })
      const workspace2 = yield* db.upsertWorkspace({
        path: "/test/ws2",
        is_open: true,
      })

      // Add terminals to each workspace with different cwds
      yield* db.insertTerminal({
        workspace_id: workspace1.id as WorkspacePrimaryKey,
        cwd_path: "/home/user/ws1-dir",
      })

      yield* db.insertTerminal({
        workspace_id: workspace2.id as WorkspacePrimaryKey,
        cwd_path: "/home/user/ws2-dir",
      })

      // Query terminals for workspace 1
      const ws1Terminals = yield* db.selectTerminalsForWorkspace(
        workspace1.id as WorkspacePrimaryKey,
      )

      // Should only get terminals from workspace 1
      expect(ws1Terminals).toHaveLength(1)
      expect(ws1Terminals[0].cwd_path).toBe("/home/user/ws1-dir")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("cwd_path is preserved when custom_title is null", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: "/test/workspace",
        is_open: true,
      })

      // Insert terminal without custom_title
      const terminal = yield* db.insertTerminal({
        workspace_id: workspace.id as WorkspacePrimaryKey,
        cwd_path: "/tmp/test-dir",
      })

      // Verify the terminal has the cwd_path
      expect(terminal.cwd_path).toBe("/tmp/test-dir")

      // Query it back and verify it's still there
      const terminals = yield* db.selectTerminalsForWorkspace(workspace.id as WorkspacePrimaryKey)
      expect(terminals[0].cwd_path).toBe("/tmp/test-dir")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("deleteTerminal removes terminal from database", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: "/test/workspace",
        is_open: true,
      })
      const workspaceId = workspace.id as WorkspacePrimaryKey

      // Insert and delete a terminal
      const terminal = yield* db.insertTerminal({
        workspace_id: workspaceId,
        cwd_path: "/home/user/project",
      })

      yield* db.deleteTerminal(terminal.id)

      // Verify it's gone
      const terminals = yield* db.selectTerminalsForWorkspace(workspaceId)
      expect(terminals).toHaveLength(0)
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("deleteAllTerminalsForWorkspace only deletes terminals in that workspace", () =>
    Effect.gen(function* () {
      const db = yield* Database

      // Create two workspaces with terminals
      const workspace1 = yield* db.upsertWorkspace({
        path: "/test/ws1",
        is_open: true,
      })
      const workspace2 = yield* db.upsertWorkspace({
        path: "/test/ws2",
        is_open: true,
      })

      yield* db.insertTerminal({
        workspace_id: workspace1.id as WorkspacePrimaryKey,
        cwd_path: "/home/user/ws1",
      })

      yield* db.insertTerminal({
        workspace_id: workspace2.id as WorkspacePrimaryKey,
        cwd_path: "/home/user/ws2",
      })

      // Delete all terminals in workspace 1
      yield* db.deleteAllTerminalsForWorkspace(workspace1.id as WorkspacePrimaryKey)

      // Verify workspace 1 has no terminals
      const ws1Terminals = yield* db.selectTerminalsForWorkspace(
        workspace1.id as WorkspacePrimaryKey,
      )
      expect(ws1Terminals).toHaveLength(0)

      // Verify workspace 2 still has its terminal
      const ws2Terminals = yield* db.selectTerminalsForWorkspace(
        workspace2.id as WorkspacePrimaryKey,
      )
      expect(ws2Terminals).toHaveLength(1)
      expect(ws2Terminals[0].cwd_path).toBe("/home/user/ws2")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )

  it.effect("updateTerminal updates cwd_path in the database", () =>
    Effect.gen(function* () {
      const db = yield* Database

      const workspace = yield* db.upsertWorkspace({
        path: "/test/workspace",
        is_open: true,
      })

      // Create terminal with initial cwd
      const terminal = yield* db.insertTerminal({
        workspace_id: workspace.id as WorkspacePrimaryKey,
        cwd_path: "/home/user/initial",
      })

      expect(terminal.cwd_path).toBe("/home/user/initial")

      // Update the cwd
      yield* db.updateTerminal(terminal.id, "/home/user/updated")

      // Verify the update persisted
      const terminals = yield* db.selectTerminalsForWorkspace(workspace.id as WorkspacePrimaryKey)
      expect(terminals).toHaveLength(1)
      expect(terminals[0].cwd_path).toBe("/home/user/updated")
    }).pipe(Effect.provide(TestDatabaseLayer)),
  )
})
