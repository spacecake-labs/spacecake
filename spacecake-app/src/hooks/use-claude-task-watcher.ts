import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"

import { claudeStatuslineAtom } from "@/lib/atoms/atoms"
import { claudeTasksAtom } from "@/lib/atoms/claude-tasks"
import { isRight } from "@/types/adt"

/**
 * Watches the Claude Code task list for the current session.
 * On file changes, re-fetches the full task list via IPC.
 */
export function useClaudeTaskWatcher() {
  const statusline = useAtomValue(claudeStatuslineAtom)
  const setTasks = useSetAtom(claudeTasksAtom)
  const sessionId = statusline?.sessionId ?? undefined
  const prevSessionIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!sessionId) return
    if (sessionId === prevSessionIdRef.current) return
    prevSessionIdRef.current = sessionId

    const fetchTasks = async () => {
      const result = await window.electronAPI.claude.tasks.list(sessionId)
      if (isRight(result)) {
        setTasks(result.value)
      }
    }

    // Load initial tasks and start watching
    fetchTasks()
    window.electronAPI.claude.tasks.startWatching(sessionId)

    // On any file change, re-fetch the full list
    const unsubscribe = window.electronAPI.claude.tasks.onChange(fetchTasks)

    return () => {
      unsubscribe()
      window.electronAPI.claude.tasks.stopWatching()
    }
  }, [sessionId, setTasks])
}
