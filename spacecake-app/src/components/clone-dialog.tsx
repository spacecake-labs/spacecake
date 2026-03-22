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

interface CloneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloneDialog({ open, onOpenChange }: CloneDialogProps) {
  const navigate = useNavigate()
  const [url, setUrl] = useState("")
  const [targetPath, setTargetPath] = useState("")
  const [isCloning, setIsCloning] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isCloning) {
      setUrl("")
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

  const handleClone = async () => {
    if (!url.trim() || !targetPath.trim()) return
    setIsCloning(true)
    try {
      const result = await window.electronAPI.git.clone(url.trim(), targetPath.trim())
      if (isRight(result)) {
        toast.success("repository cloned")
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
      toast.error("clone failed", { description: String(err) })
    } finally {
      setIsCloning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>clone repository</DialogTitle>
          <DialogDescription>
            enter a repository url and choose a directory to clone into.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="repository url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isCloning}
            data-testid="clone-url-input"
          />
          <div className="flex items-center gap-2">
            <Input
              placeholder="target directory"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              disabled={isCloning}
              className="flex-1"
              data-testid="clone-path-input"
            />
            <Button
              variant="outline"
              onClick={handlePickDirectory}
              disabled={isCloning}
              className="shrink-0 cursor-pointer"
            >
              browse
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isCloning}
            className="cursor-pointer"
          >
            cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={!url.trim() || !targetPath.trim() || isCloning}
            className="cursor-pointer"
            data-testid="clone-submit-button"
          >
            {isCloning && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
