import { useAtom, useAtomValue } from "jotai"
import { GitBranch, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { branchDeleteStateAtom, gitBranchAtom, gitBranchListAtom } from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import { isRight } from "@/types/adt"

interface BranchPopoverProps {
  workspacePath: string
  isExpanded: boolean
}

export function BranchPopover({ workspacePath, isExpanded }: BranchPopoverProps) {
  const gitBranch = useAtomValue(gitBranchAtom)
  const [branchList, setBranchList] = useAtom(gitBranchListAtom)
  const [branchDeleteState, setBranchDeleteState] = useAtom(branchDeleteStateAtom)
  const [open, setOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const newBranchNameRef = useRef("")
  newBranchNameRef.current = newBranchName

  const refreshBranches = useCallback(async () => {
    const result = await window.electronAPI.git.listBranches(workspacePath)
    if (isRight(result)) {
      setBranchList(result.value.all)
    }
  }, [workspacePath, setBranchList])

  useEffect(() => {
    refreshBranches()
  }, [refreshBranches])

  const handleSwitchBranch = useCallback(
    async (name: string) => {
      const result = await window.electronAPI.git.switchBranch(workspacePath, name)
      if (isRight(result)) {
        setOpen(false)
      } else {
        toast.error(result.value.description)
      }
    },
    [workspacePath],
  )

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchNameRef.current.trim()
    if (!name) return
    const result = await window.electronAPI.git.createBranch(workspacePath, name)
    if (isRight(result)) {
      setNewBranchName("")
      setOpen(false)
      toast.success(`created branch ${name}`)
    } else {
      toast.error(result.value.description)
    }
  }, [workspacePath])

  const handleDeleteBranch = useCallback(async () => {
    if (!branchDeleteState.isOpen) return
    const result = await window.electronAPI.git.deleteBranch(
      workspacePath,
      branchDeleteState.branchName,
    )
    if (isRight(result)) {
      toast.success(`deleted branch ${branchDeleteState.branchName}`)
      refreshBranches()
    } else {
      toast.error(result.value.description)
    }
    setBranchDeleteState({ isOpen: false })
  }, [workspacePath, branchDeleteState, setBranchDeleteState, refreshBranches])

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="switch branch"
          >
            <GitBranch
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            />
            {gitBranch && <span className="text-xs truncate max-w-[120px]">{gitBranch}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Input
                placeholder="new branch name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateBranch()
                }}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                className="h-7 text-xs px-2 shrink-0"
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
              >
                create
              </Button>
            </div>
            <div className="max-h-48 overflow-auto space-y-0.5">
              {branchList.map((branch) => (
                <div
                  key={branch}
                  className={cn(
                    "flex items-center justify-between gap-1 px-2 py-1 rounded text-xs",
                    branch === gitBranch
                      ? "bg-accent font-medium"
                      : "hover:bg-accent cursor-pointer",
                  )}
                >
                  <button
                    className="flex-1 text-left truncate cursor-pointer"
                    onClick={() => branch !== gitBranch && handleSwitchBranch(branch)}
                    disabled={branch === gitBranch}
                  >
                    {branch}
                  </button>
                  {branch !== gitBranch && (
                    <button
                      onClick={() => setBranchDeleteState({ isOpen: true, branchName: branch })}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      title="delete branch"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog
        open={branchDeleteState.isOpen}
        onOpenChange={(open) => {
          if (!open) setBranchDeleteState({ isOpen: false })
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>delete branch</DialogTitle>
            <DialogDescription>
              {branchDeleteState.isOpen &&
                `delete branch "${branchDeleteState.branchName}"? this cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDeleteState({ isOpen: false })}>
              cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBranch}>
              delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
