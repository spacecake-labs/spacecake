import { ReactNode, useEffect, useRef } from "react"
import type { PaneMachineRef } from "@/machines/pane"
import { atom, useAtomValue, useSetAtom } from "jotai"

import type { ClaudeCodeStatus } from "@/types/claude-code"
import { AbsolutePath } from "@/types/workspace"
import { claudeStatuslineAtom } from "@/lib/atoms/atoms"

// Atoms for Claude integration state
export const claudeStatusAtom = atom<ClaudeCodeStatus>("disconnected")
export const claudeServerReadyAtom = atom<boolean>(false)

interface ClaudeIntegrationProviderProps {
  workspacePath: string
  enabled: boolean
  children: ReactNode
  machine: PaneMachineRef
}

export function ClaudeIntegrationProvider({
  workspacePath,
  enabled,
  children,
  machine,
}: ClaudeIntegrationProviderProps) {
  const setStatus = useSetAtom(claudeStatusAtom)
  const setStatusline = useSetAtom(claudeStatuslineAtom)
  const serverReady = useAtomValue(claudeServerReadyAtom)
  const setServerReady = useSetAtom(claudeServerReadyAtom)
  const serverStarted = useRef(false)

  // Start server when enabled
  useEffect(() => {
    if (enabled && !serverStarted.current && workspacePath) {
      serverStarted.current = true
      // Update CLI server workspace folders
      window.electronAPI.updateCliWorkspaces([workspacePath])
      window.electronAPI.claude
        .ensureServer([workspacePath])
        .then(() => setServerReady(true))
        .catch((err) => {
          console.error("Failed to start Claude Code server:", err)
          serverStarted.current = false // Allow retry
        })
    }
  }, [enabled, workspacePath])

  // Set up listeners after server is ready
  useEffect(() => {
    if (!serverReady) return

    const cleanups: Array<() => void> = []

    cleanups.push(window.electronAPI.claude.onStatusChange(setStatus))

    cleanups.push(window.electronAPI.claude.onStatuslineUpdate(setStatusline))

    cleanups.push(
      window.electronAPI.claude.onOpenFile((payload) => {
        // Use the pane machine to open files - this serializes the operation
        // with close operations ensuring they complete in order.
        machine.send({
          type: "pane.file.open",
          filePath: AbsolutePath(payload.filePath),
        })
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [serverReady, setStatus, setStatusline, machine])

  return children
}
