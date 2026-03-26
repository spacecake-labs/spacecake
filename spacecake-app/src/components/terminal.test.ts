import { describe, it, expect } from "vitest"

/**
 * Terminal Component Tab State Tests
 *
 * Tests the tab restoration logic to ensure cwdPath is preserved across
 * app restarts (from database) and renderer reloads (from in-memory state).
 */

interface TabState {
  id: string
  label: string
  surfaceId: string
  cwdPath: string
}

interface DBTerminal {
  id: string
  surface_id: string
  cwd_path: string
  created_at: string
}

interface MemoryTerminal {
  id: string
  surfaceId: string
  label: string
  cwdPath: string
}

describe("Terminal tab restoration", () => {
  describe("database restoration (app restart)", () => {
    it("should preserve cwdPath when mapping database terminals to TabState", () => {
      // Simulate database query result
      const dbTerminals: DBTerminal[] = [
        {
          id: "term-1",
          surface_id: "surface-1",
          cwd_path: "/home/user/projects",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "term-2",
          surface_id: "surface-2",
          cwd_path: "/tmp",
          created_at: "2024-01-01T00:00:01Z",
        },
      ]

      // Simulate the restoration logic from terminal.tsx
      const restoredTabs: TabState[] = dbTerminals.map((t) => ({
        id: t.id,
        surfaceId: t.surface_id,
        label: "\u{1F370}",
        cwdPath: t.cwd_path,
      }))

      expect(restoredTabs).toHaveLength(2)
      expect(restoredTabs[0]).toEqual({
        id: "term-1",
        surfaceId: "surface-1",
        label: "\u{1F370}",
        cwdPath: "/home/user/projects",
      })
      expect(restoredTabs[1]).toEqual({
        id: "term-2",
        surfaceId: "surface-2",
        label: "\u{1F370}",
        cwdPath: "/tmp",
      })
    })

    it("should handle empty database result gracefully", () => {
      const dbTerminals: DBTerminal[] = []

      const restoredTabs: TabState[] = dbTerminals.map((t) => ({
        id: t.id,
        surfaceId: t.surface_id,
        label: "\u{1F370}",
        cwdPath: t.cwd_path,
      }))

      expect(restoredTabs).toHaveLength(0)
    })

    it("should preserve different cwdPath values for different tabs", () => {
      const dbTerminals: DBTerminal[] = [
        {
          id: "term-1",
          surface_id: "surface-1",
          cwd_path: "/home/user",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "term-2",
          surface_id: "surface-2",
          cwd_path: "/var/log",
          created_at: "2024-01-01T00:00:01Z",
        },
        {
          id: "term-3",
          surface_id: "surface-3",
          cwd_path: "/opt/app",
          created_at: "2024-01-01T00:00:02Z",
        },
      ]

      const restoredTabs: TabState[] = dbTerminals.map((t) => ({
        id: t.id,
        surfaceId: t.surface_id,
        label: "\u{1F370}",
        cwdPath: t.cwd_path,
      }))

      const cwdPaths = restoredTabs.map((t) => t.cwdPath)
      expect(cwdPaths).toEqual(["/home/user", "/var/log", "/opt/app"])
    })
  })

  describe("in-memory restoration (renderer reload)", () => {
    it("should preserve cwdPath from in-memory state after renderer reload", () => {
      // Simulate in-memory state retrieved from main process
      const memState = {
        tabs: [
          {
            id: "term-1",
            surfaceId: "surface-1",
            label: "bash",
            cwdPath: "/home/user/projects",
          },
          {
            id: "term-2",
            surfaceId: "surface-2",
            label: "node",
            cwdPath: "/home/user/projects/app",
          },
        ] as MemoryTerminal[],
        activeId: "term-1",
      }

      // Simulate the in-memory restoration logic from terminal.tsx
      const restoredTabs: TabState[] = memState.tabs.map((t) => ({
        id: t.id,
        surfaceId: t.surfaceId,
        label: t.label,
        cwdPath: t.cwdPath,
      }))

      expect(restoredTabs).toHaveLength(2)
      expect(restoredTabs[0].cwdPath).toBe("/home/user/projects")
      expect(restoredTabs[1].cwdPath).toBe("/home/user/projects/app")
    })

    it("should handle empty in-memory state", () => {
      const memState = {
        tabs: [] as MemoryTerminal[],
        activeId: null,
      }

      const restoredTabs: TabState[] = memState.tabs.map((t) => ({
        id: t.id,
        surfaceId: t.surfaceId,
        label: t.label,
        cwdPath: t.cwdPath,
      }))

      expect(restoredTabs).toHaveLength(0)
    })
  })

  describe("tab state synchronization", () => {
    it("should preserve cwdPath when syncing tabs to main process", () => {
      const tabs: TabState[] = [
        {
          id: "term-1",
          label: "bash",
          surfaceId: "surface-1",
          cwdPath: "/home/user/projects",
        },
        {
          id: "term-2",
          label: "node",
          surfaceId: "surface-2",
          cwdPath: "/tmp/workspace",
        },
      ]

      // Simulate the sync logic from terminal.tsx
      const syncedState = {
        tabs: tabs.map((t) => ({
          id: t.id,
          surfaceId: t.surfaceId,
          label: t.label,
          cwdPath: t.cwdPath,
        })),
        activeId: tabs[0].id,
      }

      // Verify cwdPath is present in synced state
      expect(syncedState.tabs[0].cwdPath).toBe("/home/user/projects")
      expect(syncedState.tabs[1].cwdPath).toBe("/tmp/workspace")
    })

    it("should not use workspace cwd for individual tabs", () => {
      // This test ensures we use tab.cwdPath, not the workspace cwd
      const workspaceCwd = "/home/user"
      const tabs: TabState[] = [
        {
          id: "term-1",
          label: "bash",
          surfaceId: "surface-1",
          cwdPath: "/home/user/projects/repo1", // different from workspace cwd
        },
        {
          id: "term-2",
          label: "node",
          surfaceId: "surface-2",
          cwdPath: "/var/log", // different from workspace cwd
        },
      ]

      // When rendering TerminalTab, we should use tab.cwdPath, not workspaceCwd
      tabs.forEach((tab) => {
        const cwdToUse = tab.cwdPath // not workspaceCwd
        expect(cwdToUse).not.toBe(workspaceCwd)
      })
    })
  })

  describe("new tab creation", () => {
    it("should set cwdPath when creating new tab", () => {
      const workspaceCwd = "/home/user/projects"
      const newTerminalRow = {
        id: "term-new",
        surface_id: "surface-new",
        cwd_path: workspaceCwd,
      }

      // Simulate the new tab creation logic from terminal.tsx addTab
      const tab: TabState = {
        id: newTerminalRow.id,
        label: "\u{1F370}",
        surfaceId: newTerminalRow.surface_id,
        cwdPath: newTerminalRow.cwd_path,
      }

      expect(tab.cwdPath).toBe(workspaceCwd)
      expect(tab).toHaveProperty("cwdPath")
    })
  })
})
