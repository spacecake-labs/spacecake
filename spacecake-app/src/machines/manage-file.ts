import { type FileUpdateBuffer } from "@/schema/file"
import { Database } from "@/services/database"
import { FileManager } from "@/services/file-manager"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

import { AbsolutePath } from "@/types/workspace"

export const fileMachine = setup({
  types: {
    events: {} as
      | {
          type: "file.read"
          filePath: AbsolutePath
        }
      | {
          type: "file.update.buffer"
          file: FileUpdateBuffer
        },
  },
  actors: {
    readFile: fromPromise(
      async ({
        input,
      }: {
        input: {
          filePath: AbsolutePath
        }
      }) => {
        return await RuntimeClient.runPromise(
          Effect.gen(function* () {
            const fm = yield* FileManager
            return yield* fm.readFile(input.filePath)
          })
        )
      }
    ),
    updateFileBuffer: fromPromise(
      ({
        input,
      }: {
        input: {
          file: FileUpdateBuffer
        }
      }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.updateFileBuffer(input.file)
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
        "file.read": {
          target: "reading",
        },
        "file.update.buffer": {
          target: "updatingBuffer",
        },
      },
    },
    reading: {
      invoke: {
        src: "readFile",
        input: ({ event }) => {
          assertEvent(event, "file.read")
          return {
            filePath: event.filePath,
          }
        },
        onError: { target: "idle" },
        onDone: { target: "idle" },
      },
    },
    updatingBuffer: {
      invoke: {
        src: "updateFileBuffer",
        input: ({ event }) => {
          assertEvent(event, "file.update.buffer")
          return {
            file: event.file,
          }
        },
        onError: { target: "idle" },
        onDone: { target: "idle" },
      },
    },
  },
})

export type FileMachine = typeof fileMachine
export type FileMachineActor = ActorRefFrom<typeof fileMachine>
