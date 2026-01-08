import { useAtomValue } from "jotai"

import { claudeCodeStatusAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"

interface ClaudeStatusBadgeProps {
  className?: string
}

export function ClaudeStatusBadge({ className }: ClaudeStatusBadgeProps) {
  const status = useAtomValue(claudeCodeStatusAtom)
  const statusConfig = {
    connected: {
      dotColor: "bg-emerald-500",
      text: "claude",
      textColor: "text-emerald-400",
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-950/40",
      title: "claude code connected",
    },
    connecting: {
      dotColor: "bg-amber-500",
      text: "claude",
      textColor: "text-amber-400",
      borderColor: "border-amber-500/30",
      bgColor: "bg-amber-950/40",
      title: "connecting to claude code",
    },
    disconnected: {
      dotColor: "bg-zinc-500",
      text: "claude",
      textColor: "text-zinc-500",
      borderColor: "border-zinc-700/50",
      bgColor: "bg-zinc-900/40",
      title: "claude code disconnected",
    },
  }

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-all",
        config.bgColor,
        config.borderColor,
        className
      )}
      title={config.title}
    >
      <div className="relative flex items-center">
        <div
          className={cn(
            "size-1.5 rounded-full",
            config.dotColor,
            status === "connecting" && "animate-pulse"
          )}
        />
        {status === "connecting" && (
          <div
            className={cn(
              "absolute size-1.5 rounded-full animate-ping",
              config.dotColor,
              "opacity-75"
            )}
          />
        )}
      </div>
      <span className={cn("font-mono", config.textColor)}>{config.text}</span>
    </div>
  )
}
