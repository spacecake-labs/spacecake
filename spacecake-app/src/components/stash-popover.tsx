import { useAtom, useAtomValue } from "jotai"
import { Archive, Loader2, Trash2 } from "lucide-react"
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
import { gitStashListAtom, isBusyAtom } from "@/lib/atoms/git"
import { isRight } from "@/types/adt"

interface StashPopoverProps {
  workspacePath: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function StashPopover({
  workspacePath,
  open: controlledOpen,
  onOpenChange,
}: StashPopoverProps) {
  const [stashList, setStashList] = useAtom(gitStashListAtom)
  const isBusy = useAtomValue(isBusyAtom)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [stashMessage, setStashMessage] = useState("")
  const [isPushing, setIsPushing] = useState(false)
  const [dropConfirm, setDropConfirm] = useState<
    { isOpen: false } | { isOpen: true; index: number }
  >({ isOpen: false })
  const stashMessageRef = useRef(stashMessage)
  stashMessageRef.current = stashMessage

  const refreshStashList = useCallback(async () => {
    const result = await window.electronAPI.git.stashList(workspacePath)
    if (isRight(result)) {
      setStashList(result.value)
    }
  }, [workspacePath, setStashList])

  useEffect(() => {
    if (open) refreshStashList()
  }, [open, refreshStashList])

  const handleStashPush = useCallback(async () => {
    setIsPushing(true)
    try {
      const msg = stashMessageRef.current.trim() || undefined
      const result = await window.electronAPI.git.stashPush(workspacePath, msg)
      if (isRight(result)) {
        toast.success("changes stashed")
        setStashMessage("")
        await refreshStashList()
      } else {
        toast.error(result.value.description, { description: result.value.detail })
      }
    } finally {
      setIsPushing(false)
    }
  }, [workspacePath, refreshStashList])

  const handleStashPop = useCallback(
    async (index: number) => {
      const result = await window.electronAPI.git.stashPop(workspacePath, index)
      if (isRight(result)) {
        toast.success("stash applied")
        await refreshStashList()
      } else {
        toast.error(result.value.description, { description: result.value.detail })
      }
    },
    [workspacePath, refreshStashList],
  )

  const handleStashDrop = useCallback(
    async (index: number) => {
      const result = await window.electronAPI.git.stashDrop(workspacePath, index)
      if (isRight(result)) {
        toast.success("stash dropped")
        await refreshStashList()
      } else {
        toast.error(result.value.description, { description: result.value.detail })
      }
      setDropConfirm({ isOpen: false })
    },
    [workspacePath, refreshStashList],
  )

  const closeDropConfirm = useCallback(() => {
    setDropConfirm({ isOpen: false })
  }, [])

  const handleDropConfirmOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) setDropConfirm({ isOpen: false })
  }, [])

  const confirmDrop = useCallback(() => {
    if (dropConfirm.isOpen) handleStashDrop(dropConfirm.index)
  }, [dropConfirm, handleStashDrop])

  const stashContent = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Input
          placeholder="stash message (optional)"
          value={stashMessage}
          onChange={(e) => setStashMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleStashPush()
          }}
          className="h-7 text-xs md:text-xs shadow-none focus-visible:!ring-0"
          disabled={isPushing || isBusy}
          data-testid="stash-message-input"
        />
        <Button
          size="sm"
          className="h-7 text-xs px-2.5 shrink-0 cursor-pointer"
          onClick={handleStashPush}
          disabled={isPushing || isBusy}
          data-testid="stash-push-button"
        >
          {isPushing ? <Loader2 className="h-3 w-3 animate-spin" /> : "stash all"}
        </Button>
      </div>
      {stashList.length > 0 ? (
        <div className="max-h-48 overflow-auto space-y-0.5" data-testid="stash-list">
          {stashList.map((entry) => (
            <div
              key={entry.index}
              className="flex items-center justify-between gap-1 px-2 py-1 rounded text-xs hover:bg-accent"
              data-testid={`stash-entry-${entry.index}`}
            >
              <span className="flex-1 truncate" title={entry.message}>
                {entry.message}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleStashPop(entry.index)}
                  disabled={isBusy}
                  className="px-1.5 py-0.5 rounded text-xs hover:bg-primary/10 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="pop stash"
                  aria-label={`pop stash ${entry.index}`}
                  data-testid={`stash-pop-${entry.index}`}
                >
                  pop
                </button>
                <button
                  onClick={() => setDropConfirm({ isOpen: true, index: entry.index })}
                  disabled={isBusy}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="drop stash"
                  aria-label={`drop stash ${entry.index}`}
                  data-testid={`stash-drop-${entry.index}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-2">no stashes</div>
      )}
    </div>
  )

  return (
    <>
      {controlledOpen !== undefined ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm p-4">
            <DialogHeader>
              <DialogTitle>stashes</DialogTitle>
            </DialogHeader>
            {stashContent}
          </DialogContent>
        </Dialog>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="stash"
              aria-label="stash"
              disabled={isBusy}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            {stashContent}
          </PopoverContent>
        </Popover>
      )}
      <Dialog open={dropConfirm.isOpen} onOpenChange={handleDropConfirmOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>drop stash</DialogTitle>
            <DialogDescription>
              {dropConfirm.isOpen && `drop stash@{${dropConfirm.index}}? this cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDropConfirm} className="cursor-pointer">
              cancel
            </Button>
            <Button variant="destructive" onClick={confirmDrop} className="cursor-pointer">
              drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
