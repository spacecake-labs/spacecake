import { fileStateMachine } from "@/machines/file-tree"
import { FileWarning } from "lucide-react"
import type { EventFrom, SnapshotFrom } from "xstate"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type FileConflictBannerProps = {
  state: SnapshotFrom<typeof fileStateMachine>
  send: (event: EventFrom<typeof fileStateMachine>) => void
}

export function FileConflictBanner({ state, send }: FileConflictBannerProps) {
  if (state.value === "Conflict") {
    return (
      <Alert className="rounded-lg border border-border bg-muted/50 py-4 px-6">
        <div className="flex items-center w-full gap-8">
          <div className="flex items-center gap-3 flex-shrink-0">
            <FileWarning className="h-4 w-4" />
            <div className="flex flex-col">
              <AlertTitle className="text-sm font-medium">
                external file change detected 🧐
              </AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                which version should we keep?
              </AlertDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => send({ type: "file.resolve.overwrite" })}
            >
              keep mine
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              onClick={() => {
                send({ type: "file.resolve.discard" })
              }}
            >
              keep theirs
            </Button>
          </div>
        </div>
      </Alert>
    )
  }
  return null
}
