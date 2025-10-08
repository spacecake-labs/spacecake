import { type FileUpdateState } from "@/schema/file"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

import { AbsolutePath } from "@/types/workspace"

export const fileMachine = setup({
  types: {
    events: {} as {
      type: "file.update.state"
      workspacePath: AbsolutePath
      file: FileUpdateState
    },
  },
  actors: {
    upsertFile: fromPromise(
      ({
        input,
      }: {
        input: {
          workspacePath: AbsolutePath
          file: FileUpdateState
        }
      }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.updateFileState(input.workspacePath)(input.file)
          }).pipe(Effect.tapErrorCause(Effect.logError))
        )
    ),
  },
}).createMachine({
  id: "file",
  initial: "idle",
  states: {
    idle: {
      on: {
        "file.update.state": {
          target: "upserting",
        },
      },
    },
    upserting: {
      invoke: {
        src: "upsertFile",
        input: ({ event }) => {
          assertEvent(event, "file.update.state")
          return {
            workspacePath: event.workspacePath,
            file: event.file,
          }
        },
        onDone: {
          target: "success",
        },
        onError: {
          target: "failure",
        },
      },
    },
    success: {
      type: "final",
    },
    failure: {},
  },
})

export type FileMachine = typeof fileMachine
export type FileMachineActor = ActorRefFrom<typeof fileMachine>
