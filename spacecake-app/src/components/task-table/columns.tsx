import type { ColumnDef } from "@tanstack/react-table"

import type { ClaudeTask } from "@/types/claude-task"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export const columns: ColumnDef<ClaudeTask>[] = [
  {
    accessorKey: "id",
    header: "task",
    cell: ({ row }) => {
      return (
        <span className="text-xs text-muted-foreground font-mono">
          {row.getValue("id")}
        </span>
      )
    },
  },
  {
    accessorKey: "subject",
    header: "title",
    cell: ({ row }) => {
      return (
        <div className="max-w-[300px] truncate font-medium text-xs">
          {row.getValue("subject")}
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "status",
    cell: ({ row }) => {
      return (
        <span className="text-xs text-muted-foreground">
          {row.getValue("status")}
        </span>
      )
    },
  },
  {
    accessorKey: "description",
    header: "description",
    cell: ({ row }) => {
      const description = row.getValue("description") as string | undefined
      if (!description) return null
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-[400px] truncate text-xs text-muted-foreground">
              {description}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-[300px]">{description}</p>
          </TooltipContent>
        </Tooltip>
      )
    },
  },
  {
    accessorKey: "owner",
    header: "owner",
    cell: ({ row }) => {
      const owner = row.getValue("owner") as string | undefined
      if (!owner) return null
      return (
        <Badge variant="outline" className="text-xs font-normal font-mono">
          {owner}
        </Badge>
      )
    },
  },
]
