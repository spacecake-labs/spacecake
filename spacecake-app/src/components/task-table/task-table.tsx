import { useAtomValue } from "jotai"

import { columns } from "@/components/task-table/columns"
import { DataTable } from "@/components/task-table/data-table"
import { claudeSessionIdAtom } from "@/lib/atoms/atoms"
import { claudeTasksAtom } from "@/lib/atoms/claude-tasks"

export function TaskTable() {
  const sessionId = useAtomValue(claudeSessionIdAtom)
  const tasks = useAtomValue(claudeTasksAtom)

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        no active claude session
      </div>
    )
  }

  return (
    <div className="h-full p-2 overflow-hidden flex flex-col">
      <DataTable columns={columns} data={tasks} />
    </div>
  )
}
