import { useEffect, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"

import { isRight } from "@/types/adt"
import type { ClaudeTaskEvent } from "@/types/claude-task"
import { claudeStatuslineAtom } from "@/lib/atoms/atoms"
import { claudeTasksAtom } from "@/lib/atoms/claude-tasks"

/**
 * Watches the Claude Code task list for the current session.
 * Reads sessionId from claudeStatuslineAtom and subscribes to file-system events.
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

    // Start watching and load initial tasks
    const init = async () => {
      const result = await window.electronAPI.claude.tasks.list(sessionId)
      if (isRight(result)) {
        setTasks(result.value)
      }
      await window.electronAPI.claude.tasks.startWatching(sessionId)
    }
    init()

    // Subscribe to task events
    const unsubscribe = window.electronAPI.claude.tasks.onEvent(
      (event: ClaudeTaskEvent) => {
        switch (event.kind) {
          case "initial":
            setTasks(event.tasks)
            break
          case "update":
            setTasks((prev) => {
              const idx = prev.findIndex((t) => t.id === event.task.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = event.task
                return next
              }
              return [...prev, event.task]
            })
            break
          case "remove":
            setTasks((prev) => prev.filter((t) => t.id !== event.taskId))
            break
        }
      }
    )

    return () => {
      unsubscribe()
      window.electronAPI.claude.tasks.stopWatching()
    }
  }, [sessionId, setTasks])
}
