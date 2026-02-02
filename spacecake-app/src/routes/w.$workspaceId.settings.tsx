import { createFileRoute, ErrorComponent, useNavigate } from "@tanstack/react-router"
import { X } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import type { WorkspaceSettings } from "@/schema/workspace-settings"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings"
import { getOrCreateSettingsMachine } from "@/lib/settings-actor"
import { cn, encodeBase64Url } from "@/lib/utils"

export const Route = createFileRoute("/w/$workspaceId/settings")({
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: SettingsPage,
})

type NavItem = {
  id: string
  label: string
}

const navItems: NavItem[] = [{ id: "general", label: "general" }]

function SettingsPage() {
  const { workspace } = Route.useRouteContext()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState("general")

  // Reactive settings from DB - updates automatically when DB changes
  const { settings } = useWorkspaceSettings(workspace.id)

  // Cached settings machine - lives at module level to survive unmounts
  const settingsMachine = useMemo(() => getOrCreateSettingsMachine(workspace.id), [workspace.id])

  const updateSetting = useCallback(
    <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
      const newSettings = { ...settings, [key]: value }
      // Send to settings machine - DB update triggers reactive query update
      settingsMachine.send({ type: "settings.update", settings: newSettings })
    },
    [settings, settingsMachine],
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
              <button
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                )}
              >
                {item.label}
              </button>
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
                    checked={settings.autosave === "on"}
                    onCheckedChange={(checked) => updateSetting("autosave", checked ? "on" : "off")}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
