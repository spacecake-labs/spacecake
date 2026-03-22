import { useNavigate } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useState } from "react"
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
import { encodeBase64Url } from "@/lib/utils"
import { isRight } from "@/types/adt"

interface InitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InitDialog({ open, onOpenChange }: InitDialogProps) {
  const navigate = useNavigate()
  const [targetPath, setTargetPath] = useState("")
  const [isInitializing, setIsInitializing] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isInitializing) {
      setTargetPath("")
    }
    onOpenChange(nextOpen)
  }

  const handlePickDirectory = async () => {
    const result = await window.electronAPI.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      setTargetPath(result.filePaths[0])
    }
  }

  const handleInit = async () => {
    if (!targetPath.trim()) return
    setIsInitializing(true)
    try {
      const result = await window.electronAPI.git.init(targetPath.trim())
      if (isRight(result)) {
        toast.success("repository initialized")
        handleOpenChange(false)
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId: encodeBase64Url(result.value) },
        })
      } else {
        toast.error(result.value.description, {
          description: result.value.detail,
        })
      }
    } catch (err) {
      toast.error("init failed", { description: String(err) })
    } finally {
      setIsInitializing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>new repository</DialogTitle>
          <DialogDescription>
            choose a directory to initialize as a git repository.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            placeholder="directory path"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            disabled={isInitializing}
            className="flex-1"
            data-testid="init-path-input"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePickDirectory}
            disabled={isInitializing}
            className="shrink-0 cursor-pointer"
          >
            browse
          </Button>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isInitializing}
            className="cursor-pointer"
          >
            cancel
          </Button>
          <Button
            onClick={handleInit}
            disabled={!targetPath.trim() || isInitializing}
            className="cursor-pointer"
            data-testid="init-submit-button"
          >
            {isInitializing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            initialize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
