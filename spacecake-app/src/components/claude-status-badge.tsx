import { claudeStatusAtom } from "@/providers/claude-integration-provider"
import { useAtomValue } from "jotai"

import { claudeStatuslineAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { useTheme } from "@/components/theme-provider"

interface ClaudeStatusBadgeProps {
  className?: string
}

type AggregateColor = "green" | "yellow" | "gray"

const darkBadgeConfig: Record<
  AggregateColor,
  { dotColor: string; textColor: string; borderColor: string; bgColor: string }
> = {
  green: {
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-950/40",
  },
  yellow: {
    dotColor: "bg-amber-500",
    textColor: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-950/40",
  },
  gray: {
    dotColor: "bg-zinc-500",
    textColor: "text-zinc-500",
    borderColor: "border-zinc-700/50",
    bgColor: "bg-zinc-900/40",
  },
}

const lightBadgeConfig: Record<
  AggregateColor,
  { dotColor: string; textColor: string; borderColor: string; bgColor: string }
> = {
  green: {
    dotColor: "bg-emerald-600",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    bgColor: "bg-emerald-50",
  },
  yellow: {
    dotColor: "bg-amber-500",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    bgColor: "bg-amber-50",
  },
  gray: {
    dotColor: "bg-slate-400",
    textColor: "text-slate-600",
    borderColor: "border-slate-200",
    bgColor: "bg-slate-50",
  },
}

function StatusRow({
  dotColor,
  label,
  statusText,
}: {
  dotColor: string
  label: string
  statusText: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <div className={cn("size-1.5 rounded-full", dotColor)} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-mono text-muted-foreground">{statusText}</span>
    </div>
  )
}

export function ClaudeStatusBadge({ className }: ClaudeStatusBadgeProps) {
  const status = useAtomValue(claudeStatusAtom)
  const statusline = useAtomValue(claudeStatuslineAtom)
  const { theme } = useTheme()

  const ideConnected = status === "connected"
  const statuslineActive = statusline !== null
  const sessionActive = statusline?.sessionId != null

  const activeCount = [ideConnected, statuslineActive, sessionActive].filter(
    Boolean
  ).length
  const aggregateColor: AggregateColor =
    activeCount === 3 ? "green" : activeCount > 0 ? "yellow" : "gray"

  const config =
    theme === "light"
      ? lightBadgeConfig[aggregateColor]
      : darkBadgeConfig[aggregateColor]

  const ideStatusText =
    status === "connected"
      ? "connected"
      : status === "connecting"
        ? "connecting"
        : "disconnected"

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-all cursor-default",
            config.bgColor,
            config.borderColor,
            className
          )}
          data-ide-status={status}
        >
          <div className="relative flex items-center">
            <div
              className={cn(
                "size-1.5 rounded-full",
                config.dotColor,
                aggregateColor === "yellow" && "animate-pulse"
              )}
            />
            {aggregateColor === "yellow" && (
              <div
                className={cn(
                  "absolute size-1.5 rounded-full animate-ping opacity-75",
                  config.dotColor
                )}
              />
            )}
          </div>
          <span className={cn("font-mono", config.textColor)}>claude</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-52 p-3 space-y-2">
        <StatusRow
          dotColor={
            ideConnected
              ? "bg-emerald-500"
              : status === "connecting"
                ? "bg-amber-500"
                : "bg-zinc-500"
          }
          label="IDE server"
          statusText={ideStatusText}
        />
        <StatusRow
          dotColor={statuslineActive ? "bg-emerald-500" : "bg-zinc-500"}
          label="status line"
          statusText={statuslineActive ? "active" : "inactive"}
        />
        <StatusRow
          dotColor={sessionActive ? "bg-emerald-500" : "bg-zinc-500"}
          label="tasks"
          statusText={sessionActive ? "active" : "inactive"}
        />
      </HoverCardContent>
    </HoverCard>
  )
}
