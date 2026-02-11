import { useAtom } from "jotai"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { watchmanBadgeDismissedAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"

interface WatchmanBadgeProps {
  className?: string
}

const INSTALL_URLS: Record<string, string> = {
  win32: "https://facebook.github.io/watchman/docs/install#windows",
  linux: "https://facebook.github.io/watchman/docs/install#linux",
}

export function WatchmanBadge({ className }: WatchmanBadgeProps) {
  const [dismissed, setDismissed] = useAtom(watchmanBadgeDismissedAtom)
  const { theme } = useTheme()

  const platform = window.electronAPI.platform
  if (platform !== "win32" && platform !== "linux") return null
  if (dismissed) return null

  const isDark = theme !== "light"

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-all cursor-default",
            isDark ? "border-amber-500/30 bg-amber-950/40" : "border-amber-200 bg-amber-50",
            className,
          )}
        >
          <div className={cn("size-1.5 rounded-full", isDark ? "bg-amber-500" : "bg-amber-500")} />
          <span className={cn("font-mono", isDark ? "text-amber-400" : "text-amber-700")}>
            1 recommendation
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-64 p-3 space-y-2">
        <p className="text-sm font-medium">file watcher</p>
        <p className="text-xs text-muted-foreground">
          spacecake uses @parcel/watcher for detecting file changes. installing{" "}
          <span className="font-medium text-foreground">watchman</span> improves performance on
          linux and windows.
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="cursor-pointer text-xs h-7"
            onClick={() =>
              window.electronAPI.openExternal(
                INSTALL_URLS[platform] ?? "https://facebook.github.io/watchman/docs/install",
              )
            }
          >
            install guide
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="cursor-pointer text-xs h-7"
            onClick={() => setDismissed(true)}
          >
            dismiss
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
