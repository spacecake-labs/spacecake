import { fileStateMachine } from "@/machines/file-tree"
import { AlertTriangle } from "lucide-react"
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
      <Alert variant="destructive" className="rounded-none border-x-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Conflict Detected</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            This file was modified by another program. You can either overwrite
            the file on disk with your changes, or discard your changes.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => send({ type: "file.resolve.overwrite" })}
            >
              overwrite
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                send({ type: "file.resolve.discard" })
              }}
            >
              discard
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (state.value === "ExternalChange") {
    return (
      <Alert className="rounded-none border-x-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>External Change Detected</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>The file has been changed on disk.</span>
          <Button
            size="sm"
            onClick={() => {
              send({ type: "file.reload" })
            }}
          >
            reload
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
