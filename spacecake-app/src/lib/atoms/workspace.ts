import { atom } from "jotai"

import type { FileTreeEvent } from "@/types/workspace"
import {
  lexicalEditorAtom,
  selectedFilePathAtom,
  userViewPreferencesAtom,
} from "@/lib/atoms/atoms"
import { fileTreeEventAtom } from "@/lib/atoms/file-tree"
import { getInitialEditorStateFromContent } from "@/components/editor/read-file"

export const fileEventHandlerAtom = atom(
  null,
  (get, set, event: FileTreeEvent) => {
    // The original implementation had an async callback, so we'll wrap this in an async IIFE.
    ;(async () => {
      // Handle content change events for editor updates
      if (event.kind === "contentChange") {
        const currentPath = get(selectedFilePathAtom)
        const currentEditor = get(lexicalEditorAtom)

        // First, update file tree metadata (size, modified date, etag, content hash)
        set(fileTreeEventAtom, {
          kind: "contentChange",
          path: event.path,
          etag: event.etag,
          content: event.content,
          fileType: event.fileType,
          cid: event.cid,
        })

        // Then, update editor content if this is the currently open file
        if (currentPath && currentEditor && event.path === currentPath) {
          try {
            // Get the current view preference for this file type
            const userPrefs = get(userViewPreferencesAtom)
            const currentView = userPrefs[event.fileType]

            // Create a mock FileContent object for the event
            const mockFileContent = {
              path: event.path,
              name: event.path.split("/").pop() || "",
              content: event.content,
              fileType: event.fileType,
              size: event.content.length,
              modified: new Date().toISOString(),
              etag: event.etag || "",
              cid: event.cid || "",
              kind: "file" as const,
            }

            // Use the existing function to ensure consistency
            const updateFunction = getInitialEditorStateFromContent(
              mockFileContent,
              currentView
            )

            // Apply the update using the existing logic
            updateFunction(currentEditor)
          } catch (error) {
            console.error("error updating editor content:", error)
          }
        }
      } else {
        // Handle other file tree events
        set(fileTreeEventAtom, event)
      }
    })()
  }
)
