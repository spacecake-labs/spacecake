import { useAtomValue } from "jotai"
import { GitBranch } from "lucide-react"

import { gitBranchAtom } from "@/lib/atoms/git"
import { cn } from "@/lib/utils"

interface GitBranchBadgeProps {
  className?: string
}

export function GitBranchBadge({ className }: GitBranchBadgeProps) {
  const branch = useAtomValue(gitBranchAtom)

  if (!branch) return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono",
        "border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-400",
        className,
      )}
      title={`git branch: ${branch}`}
    >
      <GitBranch className="h-3 w-3" />
      {branch}
    </span>
  )
}
