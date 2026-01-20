import { router } from "@/router"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { toast } from "sonner"
import {
  ActorRefFrom,
  assertEvent,
  assign,
  EventFromLogic,
  fromPromise,
  setup,
  spawnChild,
  type SnapshotFrom,
} from "xstate"

import { type ViewKind } from "@/types/lexical"
import { AbsolutePath, FileType } from "@/types/workspace"
import { saveFile } from "@/lib/fs"

type FileStateMachineContext = {
  filePath: AbsolutePath
  fileType: FileType
  invalidateRoute: () => Promise<void>
  epoch: number
}

type FILE_STATE_KEYS = {
  Idle: null
  Clean: null
  Dirty: null
  Saving: null
  Reparsing: null
  ExternalChange: null
  Conflict: null
  ClearingEditorStates: null
  Reloading: null
}

export type FileState = keyof FILE_STATE_KEYS

type FileStateMachineEvent =
  | { type: "file.clean" }
  | { type: "file.dirty" }
  | { type: "file.edit" }
  | { type: "file.save"; content: string; viewKind: ViewKind }
  | { type: "file.reparse.complete" }
  | { type: "file.reparse.error" }
  | { type: "file.external.change" }
  | { type: "file.resolve.overwrite" }
  | { type: "file.resolve.discard" }
  | { type: "file.reload" }
  | { type: "file.revert" }

export const fileStateMachine = setup({
  types: {
    context: {} as FileStateMachineContext,
    events: {} as FileStateMachineEvent,
    input: {} as FileStateMachineContext,
  },

  actions: {
    incrementEpoch: assign({
      epoch: ({ context }) => context.epoch + 1,
    }),
  },

  actors: {
    clearEditorStatesForFile: fromPromise(
      ({ input }: { input: { filePath: AbsolutePath } }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.clearEditorStatesForFile(input.filePath)
          }).pipe(Effect.tapErrorCause(Effect.logError))
        )
    ),
    reloadRoute: fromPromise(
      ({ input }: { input: { invalidateRoute: () => Promise<void> } }) =>
        input.invalidateRoute()
    ),
    saveFile: fromPromise(
      async ({
        input: { filePath, fileType, content, viewKind },
      }: {
        input: {
          filePath: AbsolutePath
          fileType: FileType
          content: string
          viewKind: ViewKind
        }
      }) => {
        const ok = await saveFile(filePath, content)
        if (!ok) {
          throw new Error("failed to save file")
        }

        await RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.clearEditorStatesForFile(filePath)
          }).pipe(Effect.tapErrorCause(Effect.logError))
        )

        // Return info including viewKind for transition decision
        return {
          filePath,
          fileType,
          content,
          viewKind,
        }
      }
    ),
  },
}).createMachine({
  id: "file",
  initial: "Idle",
  context: ({ input }) => {
    return {
      filePath: input.filePath,
      fileType: input.fileType,
      invalidateRoute: router.invalidate,
      epoch: 0,
    }
  },
  states: {
    Idle: {
      on: {
        "file.clean": "Clean",
        "file.dirty": "Dirty",
      },
    },
    Clean: {
      on: {
        "file.save": "Saving",
        "file.edit": "Dirty",
        "file.external.change": "Reloading",
      },
    },
    Dirty: {
      on: {
        "file.save": "Saving",
        "file.external.change": "Conflict",
        "file.revert": "ClearingEditorStates",
      },
    },
    Saving: {
      invoke: {
        src: "saveFile",
        input: ({
          context,
          event,
        }: {
          context: FileStateMachineContext
          event: FileStateMachineEvent
        }) => {
          assertEvent(event, "file.save")
          return {
            filePath: context.filePath,
            fileType: context.fileType,
            content: event.content,
            viewKind: event.viewKind,
          }
        },
        onDone: [
          {
            // Only reparse if Python file in rich view
            target: "Reparsing",
            guard: ({
              context,
              event,
            }: {
              context: FileStateMachineContext
              event: {
                output: {
                  filePath: AbsolutePath
                  fileType: FileType
                  content: string
                  viewKind: ViewKind
                }
              }
            }) => {
              return (
                context.fileType === FileType.Python &&
                event.output.viewKind === "rich"
              )
            },
          },
          {
            // All other cases skip reparse and go straight to Clean
            target: "Clean",
          },
        ],
        onError: {
          target: "Dirty",
          actions: () => {
            toast("failed to save file")
          },
        },
      },
      on: {
        "file.external.change": "Conflict",
      },
    },
    Reparsing: {
      on: {
        "file.reparse.complete": "Clean",
        "file.reparse.error": {
          target: "Dirty",
          actions: () => {
            toast("failed to reparse file")
          },
        },
      },
    },
    ExternalChange: {
      on: {
        "file.reload": "ClearingEditorStates",
        "file.edit": "Conflict",
      },
    },
    Conflict: {
      on: {
        "file.resolve.overwrite": "Dirty",
        "file.resolve.discard": "ClearingEditorStates",
      },
    },
    ClearingEditorStates: {
      entry: "incrementEpoch",
      invoke: {
        src: "clearEditorStatesForFile",
        input: ({ context }: { context: FileStateMachineContext }) => ({
          filePath: context.filePath,
        }),
        onDone: "Reloading",
        onError: "Conflict",
      },
    },
    Reloading: {
      invoke: {
        src: "reloadRoute",
        input: ({ context }: { context: FileStateMachineContext }) => ({
          invalidateRoute: context.invalidateRoute,
        }),
        onDone: "Clean",
        onError: "Conflict",
      },
    },
  } as const satisfies Record<FileState, unknown>,
})

export type FileStateEvent = EventFromLogic<typeof fileStateMachine>
export type FileStateHydrationEvent = Extract<
  FileStateEvent,
  { type: "file.clean" | "file.dirty" }
>

type FileActorRef = ActorRefFrom<typeof fileStateMachine>

// not currently used
export const fileTreeMachine = setup({
  types: {
    events: {} as {
      type: "file.open"
      filePath: AbsolutePath
    },
  },
  actors: {},
}).createMachine({
  id: "fileTree",
  initial: "Idle",
  context: {} as {
    fileRefs: Record<AbsolutePath, FileActorRef>
  },
  states: {
    Idle: {
      on: {
        "file.open": {
          actions: assign({
            fileRefs: ({ context, event }) => {
              const filePath = event.filePath

              const newActor = spawnChild(fileStateMachine, {
                id: filePath,
              })

              return {
                ...context.fileActors,
                [filePath]: newActor,
              }
            },
          }),
        },
      },
    },
  },
})

export type T = SnapshotFrom<typeof fileTreeMachine>
