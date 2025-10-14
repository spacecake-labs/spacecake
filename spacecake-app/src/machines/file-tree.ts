import { ActorRefFrom, assign, setup, spawnChild } from "xstate"

import { AbsolutePath } from "@/types/workspace"

export const fileStateMachine = setup({
  types: {
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
          type: "file.resolve.save"
        }
      | {
          type: "file.resolve.discard"
        }
      | {
          type: "file.reload"
        },
    input: { filePath: AbsolutePath },
  },

  actors: {},
}).createMachine({
  id: "fileStatus",
  initial: "Clean",
  context: ({ input }) => ({
    filePath: input.filePath,
  }),
  states: {
    Clean: {
      on: {
        "file.edit": "Dirty",
        "file.save": "Clean",
        "file.external.change": "ExternalChange",
      },
    },
    Dirty: {
      on: {
        "file.edit": "Dirty",
        "file.save": "Clean",
        "file.external.change": "Conflict",
      },
    },
    ExternalChange: { on: { "file.reload": "Clean" } },
    Conflict: {
      on: {
        "file.resolve.save": "Dirty",
        "file.resolve.discard": "ExternalChange",
      },
    },
  },
})

type FileActorRef = ActorRefFrom<typeof fileStateMachine>

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
