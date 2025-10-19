import { router } from "@/router"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { ActorRefFrom, assign, fromPromise, setup, spawnChild } from "xstate"

import { AbsolutePath } from "@/types/workspace"

type FileStateMachineContext = {
  filePath: AbsolutePath
  invalidateRoute: () => Promise<void>
}

export const fileStateMachine = setup({
  types: {
    context: {} as FileStateMachineContext,
    events: {} as
      | {
          type: "file.edit"
        }
      | {
          type: "file.save"
        }
      | {
          type: "file.external.change"
        }
      | {
          type: "file.resolve.overwrite"
        }
      | {
          type: "file.resolve.discard"
        }
      | {
          type: "file.reload"
        },
    input: {} as FileStateMachineContext,
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
  },
}).createMachine({
  id: "file",
  initial: "Clean",
  context: ({ input }) => {
    return {
      filePath: input.filePath,
      invalidateRoute: router.invalidate,
    }
  },
  states: {
    Clean: {
      on: {
        "file.edit": "Dirty",
        "file.external.change": "Reloading",
      },
    },
    Dirty: {
      on: {
        "file.save": "Clean",
        "file.external.change": "Conflict",
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
      invoke: {
        src: "clearEditorStatesForFile",
        input: ({ context }) => ({ filePath: context.filePath }),
        onDone: "Reloading",
        onError: "Conflict",
      },
    },
    Reloading: {
      invoke: {
        src: "reloadRoute",
        input: ({ context }) => ({
          invalidateRoute: context.invalidateRoute,
        }),
        onDone: "Clean",
        onError: "Conflict",
      },
    },
  },
})

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
