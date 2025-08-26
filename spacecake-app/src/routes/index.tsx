import { RootLayout } from "@/layout"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { atom, useAtom, useSetAtom } from "jotai"
import { FolderOpen, Loader2Icon } from "lucide-react"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { openDirectory } from "@/lib/fs"
import { encodeBase64Url } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"

const fileExplorerIsOpenAtom = atom<boolean>(false)

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  const setWorkspace = useSetAtom(workspaceAtom)
  const [fileExplorerIsOpen, setFileExplorerIsOpen] = useAtom(
    fileExplorerIsOpenAtom
  )

  const navigate = useNavigate()

  const handleOpenWorkspace = async () => {
    setFileExplorerIsOpen(true)
    try {
      const selectedPath = await openDirectory()
      if (selectedPath) {
        // Just set basic workspace info and navigate
        setWorkspace({ path: selectedPath, name: "" })
        const id = encodeBase64Url(selectedPath)
        navigate({ to: "/w/$workspaceId", params: { workspaceId: id } })
      }
    } finally {
      setFileExplorerIsOpen(false)
    }
  }

  return (
    <RootLayout
      selectedFilePath={null}
      headerRightContent={
        <div className="px-4">
          <ModeToggle />
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="flex flex-col items-center space-y-3">
          <Button
            size="lg"
            className="text-base cursor-pointer"
            variant="outline"
            onClick={handleOpenWorkspace}
            disabled={fileExplorerIsOpen}
          >
            {fileExplorerIsOpen ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <FolderOpen />
            )}
            open folder
          </Button>
        </div>
      </div>
    </RootLayout>
  )
}
