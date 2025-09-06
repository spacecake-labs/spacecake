import { RootLayout } from "@/layout"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { AlertCircleIcon, FolderOpen, Loader2Icon } from "lucide-react"

import { useOpenWorkspace } from "@/lib/open-workspace"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"

const NotFoundPathSchema = Schema.standardSchemaV1(
  Schema.Struct({
    notFoundPath: Schema.optional(Schema.String),
  })
)

export const Route = createFileRoute("/")({
  validateSearch: NotFoundPathSchema,
  component: Index,
})

function Index() {
  const { notFoundPath } = Route.useSearch()

  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

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
        {notFoundPath && (
          <div className="w-full max-w-md">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>
                previous workspace not found:{"\n"}
                <code className="font-mono text-xs break-all">
                  {notFoundPath}
                </code>
              </AlertDescription>
            </Alert>
          </div>
        )}
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
