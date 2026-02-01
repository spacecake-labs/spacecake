import { useAtomValue } from "jotai"
import { Terminal } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { terminalProfileLoadedAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"

interface TerminalStatusBadgeProps {
  className?: string
}

export function TerminalStatusBadge({ className }: TerminalStatusBadgeProps) {
  const profileLoaded = useAtomValue(terminalProfileLoadedAtom)
  const { theme } = useTheme()

  const darkConfig = {
    ready: {
      iconColor: "text-emerald-400",
      ariaLabel: "shell profile loaded",
    },
    loading: {
      iconColor: "text-muted-foreground",
      ariaLabel: "terminal loading",
    },
  }

  const lightConfig = {
    ready: {
      iconColor: "text-emerald-700",
      ariaLabel: "shell profile loaded",
    },
    loading: {
      iconColor: "text-muted-foreground",
      ariaLabel: "terminal loading",
    },
  }

  const config =
    theme === "light"
      ? lightConfig[profileLoaded ? "ready" : "loading"]
      : darkConfig[profileLoaded ? "ready" : "loading"]

  return (
    <Terminal
      className={cn("h-4 w-4", config.iconColor, className)}
      role="status"
      aria-label={config.ariaLabel}
    />
  )
}
