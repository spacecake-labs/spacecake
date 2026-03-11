import { memo, useCallback, useEffect } from "react"

import { TerminalMountPoint } from "@/components/terminal-mount-point"
import type { TerminalAPI } from "@/hooks/use-ghostty-engine"
import { useGhosttyEngine } from "@/hooks/use-ghostty-engine"
import { useLatest } from "@/hooks/use-latest"

interface TerminalTabProps {
  id: string
  cwd: string
  isActive: boolean
  lockedTheme: "light" | "dark"
  onReady: (id: string, api: TerminalAPI) => void
  onDispose: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onProfileLoaded: (id: string) => void
}

export const TerminalTab = memo(function TerminalTab({
  id,
  cwd,
  isActive,
  lockedTheme,
  onReady,
  onDispose,
  onTitleChange,
  onProfileLoaded,
}: TerminalTabProps) {
  const onReadyRef = useLatest(onReady)
  const onDisposeRef = useLatest(onDispose)
  const onTitleChangeRef = useLatest(onTitleChange)
  const onProfileLoadedRef = useLatest(onProfileLoaded)

  const handleTitleChange = useCallback(
    (title: string) => onTitleChangeRef.current(id, title),
    [id],
  )

  const handleProfileLoaded = useCallback(() => onProfileLoadedRef.current(id), [id])

  const { containerEl, api, error, fit } = useGhosttyEngine({
    id,
    enabled: true,
    cwd,
    onTitleChange: handleTitleChange,
    onProfileLoaded: handleProfileLoaded,
  })

  // notify parent when API is ready
  useEffect(() => {
    if (api) {
      onReadyRef.current(id, api)
    }
    return () => {
      onDisposeRef.current(id)
    }
  }, [api, id])

  // toggle cursor blink based on focus
  useEffect(() => {
    if (!api || !containerEl) return

    const handleFocusIn = () => api.setCursorBlink(true)
    const handleFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null
      if (relatedTarget && containerEl.contains(relatedTarget)) return
      api.setCursorBlink(false)
    }

    containerEl.addEventListener("focusin", handleFocusIn)
    containerEl.addEventListener("focusout", handleFocusOut)

    if (containerEl.contains(document.activeElement)) {
      api.setCursorBlink(true)
    }

    return () => {
      containerEl.removeEventListener("focusin", handleFocusIn)
      containerEl.removeEventListener("focusout", handleFocusOut)
    }
  }, [api, containerEl])

  // refit when tab becomes active (container may have resized while hidden)
  useEffect(() => {
    if (isActive && containerEl) {
      requestAnimationFrame(() => fit())
    }
  }, [isActive, containerEl, fit])

  return (
    <div
      data-testid="terminal-tab-content"
      data-tab-id={id}
      data-active={isActive}
      className="relative w-full h-full min-h-0"
      style={{ display: isActive ? "block" : "none" }}
    >
      {containerEl && (
        <TerminalMountPoint containerEl={containerEl} lockedTheme={lockedTheme} onMount={fit} />
      )}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
          {error}
        </div>
      )}
    </div>
  )
})
