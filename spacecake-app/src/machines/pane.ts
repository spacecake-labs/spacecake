import { toast } from "sonner"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

import { removeFileStateAtom } from "@/lib/atoms/file-tree"
import * as mutations from "@/lib/db/mutations"
import { supportsRichView } from "@/lib/language-support"
import { encodeBase64Url } from "@/lib/utils"
import { fileTypeFromFileName } from "@/lib/workspace"
import { router } from "@/router"
import { EditorPrimaryKey } from "@/schema/editor"
import { PaneItemPrimaryKey, PaneItemWithFile, PanePrimaryKey } from "@/schema/pane"
import { getPersistableViewKind } from "@/services/editor-manager"
import { isSome } from "@/types/adt"
import type { OpenFileSource } from "@/types/claude-code"
import { ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"

// Context for the pane machine
export interface PaneMachineContext {
  paneId: PanePrimaryKey
  workspacePath: AbsolutePath
  workspaceId: string // encoded for navigation
}

// Events the machine can receive
export type PaneMachineEvent =
  | {
      type: "pane.item.close"
      itemId: PaneItemPrimaryKey
      filePath: string
      isClosingActiveTab: boolean
    }
  | {
      type: "pane.item.activate"
      item: PaneItemWithFile
    }
  | {
      type: "pane.file.open"
      filePath: AbsolutePath
      viewKind?: ViewKind
      source?: OpenFileSource
      baseRef?: string
      targetRef?: string
    }

// Input to create the machine
export interface PaneMachineInput {
  paneId: PanePrimaryKey
  workspacePath: AbsolutePath
  workspaceId: string
}

export const paneMachine = setup({
  types: {
    context: {} as PaneMachineContext,
    events: {} as PaneMachineEvent,
    input: {} as PaneMachineInput,
  },
  actors: {
    closeItem: fromPromise(
      async ({
        input,
      }: {
        input: {
          itemId: PaneItemPrimaryKey
          filePath: string
          workspaceId: string
          isClosingActiveTab: boolean
        }
      }): Promise<void> => {
        // Notify CLI server that file is closed (for --wait support)
        window.electronAPI.notifyFileClosed(input.filePath)

        const nextActive = await mutations.closePaneItemAndGetNext(
          input.itemId,
          input.isClosingActiveTab,
        )

        // If we closed the active tab, navigate to the next one
        if (input.isClosingActiveTab) {
          if (isSome(nextActive)) {
            router.navigate({
              to: "/w/$workspaceId/f/$filePath",
              params: {
                workspaceId: input.workspaceId,
                filePath: encodeBase64Url(AbsolutePath(nextActive.value.filePath)),
              },
              search: {
                view: nextActive.value.viewKind,
                editorId: EditorPrimaryKey(nextActive.value.editorId),
                paneActivated: true,
              },
            })
          } else {
            // No remaining tabs - navigate to workspace index
            router.navigate({
              to: "/w/$workspaceId",
              params: { workspaceId: input.workspaceId },
            })
          }
        }
        // If closing a non-active tab, no navigation needed

        // clean up the file state machine atom so it doesn't leak
        removeFileStateAtom(AbsolutePath(input.filePath))
      },
    ),
    activateItem: fromPromise(
      async ({
        input,
      }: {
        input: {
          item: PaneItemWithFile
          workspaceId: string
          paneId: PanePrimaryKey
        }
      }): Promise<void> => {
        if (!input.item.editorId) {
          return
        }

        await mutations.activatePaneItem(input.paneId, input.item.id)

        // Navigate to the activated item
        router.navigate({
          to: "/w/$workspaceId/f/$filePath",
          params: {
            workspaceId: input.workspaceId,
            filePath: encodeBase64Url(input.item.filePath),
          },
          search: {
            view: input.item.viewKind,
            editorId: input.item.editorId,
            paneActivated: true,
          },
        })
      },
    ),
    openFile: fromPromise(
      async ({
        input,
      }: {
        input: {
          filePath: AbsolutePath
          viewKind?: ViewKind
          workspaceId: string
          paneId: PanePrimaryKey
          source?: OpenFileSource
          baseRef?: string
          targetRef?: string
        }
      }): Promise<void> => {
        // Create editor and pane item, then navigate
        const fileContent = await window.electronAPI.readFile(input.filePath)

        if (fileContent._tag === "Left") {
          // File doesn't exist or can't be read
          router.navigate({
            to: "/w/$workspaceId",
            params: { workspaceId: input.workspaceId },
            search: { notFoundFilePath: input.filePath },
          })
          return
        }

        // run file upsert and editor lookup in parallel (data-independent)
        const [file, existingEditor] = await Promise.all([
          mutations.upsertFile({
            path: input.filePath,
            cid: fileContent.value.cid,
            mtime: new Date(fileContent.value.etag.mtime).toISOString(),
          }),
          mutations.selectLatestEditorStateForFile(input.filePath),
        ])

        const fileType = fileTypeFromFileName(input.filePath)

        let editorId: EditorPrimaryKey
        let viewKind: ViewKind

        if (isSome(existingEditor)) {
          // Use existing editor
          editorId = existingEditor.value.id
          viewKind = input.viewKind ?? existingEditor.value.view_kind
        } else {
          // Create new editor
          viewKind = input.viewKind ?? (supportsRichView(fileType) ? "rich" : "source")

          const editor = await mutations.upsertEditor({
            pane_id: input.paneId,
            file_id: file.id,
            view_kind: getPersistableViewKind(viewKind, fileType),
          })
          editorId = editor.id
        }

        await mutations.activateEditorInPane(editorId, input.paneId)

        // Navigate to the file
        router.navigate({
          to: "/w/$workspaceId/f/$filePath",
          params: {
            workspaceId: input.workspaceId,
            filePath: encodeBase64Url(input.filePath),
          },
          search: {
            view: viewKind,
            editorId: editorId,
            paneActivated: true,
            source: input.source,
            baseRef: input.baseRef,
            targetRef: input.targetRef,
          },
        })
      },
    ),
  },
}).createMachine({
  id: "pane",
  initial: "Idle",
  context: ({ input }) => ({
    paneId: input.paneId,
    workspacePath: input.workspacePath,
    workspaceId: input.workspaceId,
  }),
  states: {
    Idle: {
      on: {
        "pane.item.close": "Closing",
        "pane.item.activate": "Activating",
        "pane.file.open": "Opening",
      },
    },
    Closing: {
      invoke: {
        src: "closeItem",
        input: ({ context, event }) => {
          assertEvent(event, "pane.item.close")
          return {
            itemId: event.itemId,
            filePath: event.filePath,
            workspaceId: context.workspaceId,
            isClosingActiveTab: event.isClosingActiveTab,
          }
        },
        onDone: "Idle",
        onError: {
          target: "Idle",
          actions: () => {
            toast("failed to close tab")
          },
        },
      },
    },
    Activating: {
      invoke: {
        src: "activateItem",
        input: ({ context, event }) => {
          assertEvent(event, "pane.item.activate")
          return {
            item: event.item,
            workspaceId: context.workspaceId,
            paneId: context.paneId,
          }
        },
        onDone: "Idle",
        onError: {
          target: "Idle",
          actions: () => {
            toast("failed to activate tab")
          },
        },
      },
    },
    Opening: {
      invoke: {
        src: "openFile",
        input: ({ context, event }) => {
          assertEvent(event, "pane.file.open")
          return {
            filePath: event.filePath,
            viewKind: event.viewKind,
            workspaceId: context.workspaceId,
            paneId: context.paneId,
            source: event.source,
            baseRef: event.baseRef,
            targetRef: event.targetRef,
          }
        },
        onDone: "Idle",
        onError: {
          target: "Idle",
          actions: () => {
            toast("failed to open file")
          },
        },
      },
    },
  },
})

export type PaneMachine = typeof paneMachine
export type PaneMachineRef = ActorRefFrom<typeof paneMachine>
