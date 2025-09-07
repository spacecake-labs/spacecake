import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { openDirectory } from "@/lib/fs"
import { encodeBase64Url } from "@/lib/utils"

/**
 * Hook for opening a workspace directory.
 * Handles the file dialog, workspace state updates, and navigation.
 */
export function useOpenWorkspace() {
  const workspace = useAtomValue(workspaceAtom)
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenWorkspace = async () => {
    setIsOpen(true)
    try {
      const selectedPath = await openDirectory()

      if (selectedPath && selectedPath !== workspace?.path) {
        const id = encodeBase64Url(selectedPath)
        navigate({ to: "/w/$workspaceId", params: { workspaceId: id } })
      }
    } finally {
      setIsOpen(false)
    }
  }

  return { handleOpenWorkspace, isOpen }
}
