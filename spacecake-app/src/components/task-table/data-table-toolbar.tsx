import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"

const statuses = [
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in progress" },
  { value: "completed", label: "completed" },
]

interface DataTableToolbarProps<TData> {
  table: Table<TData>
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const statusColumn = table.getColumn("status")
  const filterValue = (statusColumn?.getFilterValue() as string[]) ?? []
  const isFiltered = filterValue.length > 0
  const totalRows = table.getPreFilteredRowModel().rows.length
  const filteredRows = table.getFilteredRowModel().rows.length

  const toggleStatus = (status: string) => {
    const current = filterValue
    if (current.includes(status)) {
      const next = current.filter((s) => s !== status)
      statusColumn?.setFilterValue(next.length > 0 ? next : undefined)
    } else {
      statusColumn?.setFilterValue([...current, status])
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-1 flex-wrap">
        {statuses.map((status) => {
          const isActive = filterValue.includes(status.value)
          return (
            <button
              key={status.value}
              onClick={() => toggleStatus(status.value)}
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {status.label}
            </button>
          )
        })}
        {isFiltered && (
          <button
            onClick={() => statusColumn?.setFilterValue(undefined)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-3 w-3" />
            reset
          </button>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {isFiltered ? `${filteredRows}/${totalRows}` : totalRows} tasks
      </span>
    </div>
  )
}
