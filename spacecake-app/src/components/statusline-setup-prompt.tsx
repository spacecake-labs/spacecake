import { atom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"

import type { StatuslineConfigStatus } from "@/types/electron"

import { claudeServerReadyAtom } from "@/providers/claude-integration-provider"
import { match } from "@/types/adt"

/** Conflict info when another tool owns the statusline */
export interface StatuslineConflict {
  command?: string
}

/** Atom: set when statusline is configured but not pointing to spacecake */
export const statuslineConflictAtom = atom<StatuslineConflict | null>(null)

/**
 * Headless hook that auto-configures the statusline on server ready.
 *
 * - configured: false → silently calls update()
 * - isInlineSpacecake → silently migrates old inline config to script
 * - configured: true, isSpacecake: false → sets statuslineConflictAtom
 * - configured: true, isSpacecake: true → does nothing
 */
export function useStatuslineAutoSetup() {
  const serverReady = useAtomValue(claudeServerReadyAtom)
  const setConflict = useSetAtom(statuslineConflictAtom)
  const hasFetchedRef = useRef(false)

  const autoSetup = useCallback(() => {
    window.electronAPI.claude.statusline.update().then((result) => {
      match(result, {
        onLeft: (err) => console.error("statusline auto-setup failed:", err),
        onRight: () => {},
      })
    })
  }, [])

  useEffect(() => {
    if (!serverReady || hasFetchedRef.current) return
    // Skip auto-setup in e2e tests to avoid writing to ~/.claude/settings.json
    // and creating async operations that interfere with test teardown
    if (window.electronAPI.isPlaywright) return
    hasFetchedRef.current = true

    window.electronAPI.claude.statusline.read().then((result) => {
      match(result, {
        onLeft: (err) => console.error("failed to read statusline config:", err),
        onRight: (config: StatuslineConfigStatus) => {
          if (!config.configured || config.isInlineSpacecake) {
            // Not configured, or old inline spacecake config — silently set up
            autoSetup()
          } else if (!config.isSpacecake) {
            setConflict({ command: config.command })
          }
          // configured + isSpacecake → nothing to do
        },
      })
    })
  }, [serverReady, setConflict, autoSetup])
}
