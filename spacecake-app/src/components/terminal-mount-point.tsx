import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

interface TerminalMountPointProps {
  containerEl: HTMLDivElement | null
  lockedTheme: "light" | "dark"
  className?: string
  onMount?: () => void
}

const backgroundColors = {
  light: "#ffffff",
  dark: "#0a0a0a",
} as const

export function TerminalMountPoint({
  containerEl,
  lockedTheme,
  className,
  onMount,
}: TerminalMountPointProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!wrapperRef.current || !containerEl) return

    wrapperRef.current.appendChild(containerEl)

    // Double rAF to ensure layout has settled before fitting
    if (onMount) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onMount()
        })
      })
    }

    return () => {
      containerEl.remove()
    }
  }, [containerEl, onMount])

  return (
    <div
      ref={wrapperRef}
      data-testid="ghostty-terminal"
      className={cn("relative w-full h-full p-4 box-border", className)}
      style={{ backgroundColor: backgroundColors[lockedTheme] }}
    />
  )
}
