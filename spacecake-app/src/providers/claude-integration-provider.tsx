import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { ReactNode, useEffect, useRef } from "react"
import { toast } from "sonner"

import type { PaneMachineRef } from "@/machines/pane"
import type { ClaudeCodeStatus } from "@/types/claude-code"

import { claudeStatuslineAtom, ideDisconnectedToastShownAtom } from "@/lib/atoms/atoms"
import { gitBranchAtom } from "@/lib/atoms/git"
import { AbsolutePath } from "@/types/workspace"

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
  const setGitBranch = useSetAtom(gitBranchAtom)
  const serverReady = useAtomValue(claudeServerReadyAtom)
  const setServerReady = useSetAtom(claudeServerReadyAtom)
  const serverStarted = useRef(false)
  const [ideToastShown, setIdeToastShown] = useAtom(ideDisconnectedToastShownAtom)

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

    cleanups.push(window.electronAPI.claude.onStatuslineCleared(() => setStatusline(null)))

    cleanups.push(
      window.electronAPI.claude.onOpenFile((payload) => {
        // Use the pane machine to open files - this serializes the operation
        // with close operations ensuring they complete in order.
        machine.send({
          type: "pane.file.open",
          filePath: AbsolutePath(payload.filePath),
          source: payload.source,
        })
      }),
    )

    return () => cleanups.forEach((c) => c())
  }, [serverReady, setStatus, setStatusline, machine])

  // initialize git branch and set up watcher
  useEffect(() => {
    if (!workspacePath) return

    // get initial branch
    window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)

    // start watching for git changes
    window.electronAPI.git.startWatching(workspacePath)

    // listen for git changes
    const cleanup = window.electronAPI.git.onGitChange(({ workspacePath: changedPath }) => {
      if (changedPath === workspacePath) {
        window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)
      }
    })

    return () => {
      cleanup()
      window.electronAPI.git.stopWatching(workspacePath)
    }
  }, [workspacePath, setGitBranch])

  // Show a one-time toast when Claude Code prints "IDE disconnected" in the terminal
  useEffect(() => {
    if (ideToastShown) return

    const cleanup = window.electronAPI.onIdeDisconnected(() => {
      if (!ideToastShown) {
        toast("ignore the 'IDE disconnected' warning from Claude")
        setIdeToastShown(true)
      }
    })

    return cleanup
  }, [ideToastShown, setIdeToastShown])

  return children
}
