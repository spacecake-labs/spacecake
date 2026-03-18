import { createFileRoute, ErrorComponent, Link, useNavigate } from "@tanstack/react-router"
import { X } from "lucide-react"
import { useCallback, useMemo, useOptimistic, useRef } from "react"

import { DockLayoutEditor } from "@/components/dock-layout-switcher"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout"
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings"
import * as mutations from "@/lib/db/mutations"
import { getDockPosition, transition } from "@/lib/dock-transition"
import type { DockAction } from "@/lib/dock-transition"
import { getOrCreateSettingsMachine } from "@/lib/settings-actor"
import { cn, encodeBase64Url } from "@/lib/utils"
import type { DockablePanelKind, DockPosition } from "@/schema/workspace-layout"
import type { WorkspaceSettings } from "@/schema/workspace-settings"

export const Route = createFileRoute("/w/$workspaceId/settings")({
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "general",
  }),
})

type NavItem = {
  id: string
  label: string
}

const navItems: NavItem[] = [
  { id: "general", label: "general" },
  { id: "layout", label: "layout" },
]

function SettingsPage() {
  const { workspace } = Route.useRouteContext()
  const navigate = useNavigate()
  const { tab: activeSection } = Route.useSearch()

  // Layout state from DB
  const { layout } = useWorkspaceLayout(workspace.id)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const dispatchLayout = useCallback(
    (action: DockAction) => {
      const currentLayout = layoutRef.current
      const newLayout = transition(currentLayout, action)
      if (newLayout === currentLayout) return
      layoutRef.current = newLayout as typeof currentLayout
      mutations.updateWorkspaceLayout(workspace.id, newLayout)
    },
    [workspace.id],
  )

  const terminalDock = getDockPosition(layout.dock, "terminal")
  const taskDock = getDockPosition(layout.dock, "task")
  const gitDock = getDockPosition(layout.dock, "git")

  const handleDockChange = useCallback(
    (panel: DockablePanelKind, dock: DockPosition) =>
      dispatchLayout({ kind: "move", panel, to: dock }),
    [dispatchLayout],
  )

  const handleToggle = useCallback(
    (panel: DockablePanelKind) => dispatchLayout({ kind: "toggle", panel }),
    [dispatchLayout],
  )

  // Reactive settings from DB - updates automatically when DB changes
  const { settings } = useWorkspaceSettings(workspace.id)

  // optimistic autosave - reverts to settings.autosave when DB catches up
  const [optimisticAutosave, setOptimisticAutosave] = useOptimistic(settings.autosave)
  const autosaveOn = optimisticAutosave === "on"

  // Cached settings machine - lives at module level to survive unmounts
  const settingsMachine = useMemo(() => getOrCreateSettingsMachine(workspace.id), [workspace.id])

  // ref avoids stale closure in updateSetting, keeping the callback stable
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const updateSetting = useCallback(
    <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
      const newSettings = { ...settingsRef.current, [key]: value }
      settingsMachine.send({ type: "settings.update", settings: newSettings })
    },
    [settingsMachine],
  )

  const handleAutosaveChange = useCallback(
    (checked: boolean) => {
      setOptimisticAutosave(checked ? "on" : "off")
      updateSetting("autosave", checked ? "on" : "off")
    },
    [setOptimisticAutosave, updateSetting],
  )

  const handleClose = useCallback(() => {
    const workspaceId = encodeBase64Url(workspace.path)
    navigate({ to: "/w/$workspaceId", params: { workspaceId } })
  }, [navigate, workspace.path])

  return (
    <div className="relative flex h-full">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute right-4 top-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        aria-label="close settings"
      >
        <X className="h-5 w-5" />
      </button>
      {/* Left navigation */}
      <nav className="w-48 shrink-0 border-r p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">settings</h2>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link
                to="/w/$workspaceId/settings"
                params={{ workspaceId: encodeBase64Url(workspace.path) }}
                search={{ tab: item.id }}
                replace
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {activeSection === "general" && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">general</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                configure general workspace settings
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>autosave</CardTitle>
                <CardDescription>automatically save files to disk while editing.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <label htmlFor="autosave-setting" className="text-sm">
                    enable autosave
                  </label>
                  <Switch
                    id="autosave-setting"
                    className="cursor-pointer"
                    checked={autosaveOn}
                    onCheckedChange={handleAutosaveChange}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "layout" && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">layout</h1>
              <p className="mt-1 text-sm text-muted-foreground">configure panel dock positions</p>
            </div>

            <DockLayoutEditor
              terminalDock={terminalDock}
              taskDock={taskDock}
              gitDock={gitDock}
              isTerminalExpanded={layout.panels.terminal.isExpanded}
              isTaskExpanded={layout.panels.task.isExpanded}
              isGitExpanded={layout.panels.git.isExpanded}
              onDockChange={handleDockChange}
              onToggle={handleToggle}
            />
          </div>
        )}
      </main>
    </div>
  )
}
