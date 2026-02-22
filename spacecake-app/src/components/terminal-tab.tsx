import { memo, useCallback, useEffect } from "react"

import type { TerminalAPI } from "@/hooks/use-ghostty-engine"

import { TerminalMountPoint } from "@/components/terminal-mount-point"
import { useGhosttyEngine } from "@/hooks/use-ghostty-engine"

interface TerminalTabProps {
  id: string
  cwd: string
  isActive: boolean
  onReady: (id: string, api: TerminalAPI) => void
  onDispose: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onProfileLoaded: (id: string) => void
}

export const TerminalTab = memo(function TerminalTab({
  id,
  cwd,
  isActive,
  onReady,
  onDispose,
  onTitleChange,
  onProfileLoaded,
}: TerminalTabProps) {
  const handleTitleChange = useCallback(
    (title: string) => onTitleChange(id, title),
    [id, onTitleChange],
  )

  const handleProfileLoaded = useCallback(() => onProfileLoaded(id), [id, onProfileLoaded])

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
      onReady(id, api)
    }
    return () => {
      onDispose(id)
    }
  }, [api, id, onReady, onDispose])

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
      {containerEl && <TerminalMountPoint containerEl={containerEl} onMount={fit} />}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
          {error}
        </div>
      )}
    </div>
  )
})
