import { atom } from "jotai"

import type { ClaudeTask } from "@/types/claude-task"

/** All tasks from the current Claude Code session */
export const claudeTasksAtom = atom<ClaudeTask[]>([])

/** Status filter for the task table toolbar */
export const taskStatusFilterAtom = atom<string[]>([])

/** Tasks with status "pending" */
export const pendingTasksAtom = atom((get) =>
  get(claudeTasksAtom).filter((t) => t.status === "pending")
)

/** Tasks with status "in_progress" */
export const inProgressTasksAtom = atom((get) =>
  get(claudeTasksAtom).filter((t) => t.status === "in_progress")
)

/** Tasks with status "completed" */
export const completedTasksAtom = atom((get) =>
  get(claudeTasksAtom).filter((t) => t.status === "completed")
)
