import { type FileUpdateBuffer } from "@/schema/file"
import { Database } from "@/services/database"
import { FileManager } from "@/services/file-manager"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

import { AbsolutePath, RelativePath } from "@/types/workspace"

export const fileMachine = setup({
  types: {
    events: {} as
      | {
          type: "file.read"
          workspacePath: AbsolutePath
          filePath: RelativePath
        }
      | {
          type: "file.update.buffer"
          workspacePath: AbsolutePath
          file: FileUpdateBuffer
        },
  },
  actors: {
    readFile: fromPromise(
      async ({
        input,
      }: {
        input: {
          workspacePath: AbsolutePath
          filePath: RelativePath
        }
      }) => {
        return await RuntimeClient.runPromise(
          Effect.gen(function* () {
            const fm = yield* FileManager
            return yield* fm.readFile(input.workspacePath, input.filePath)
          })
        )
      }
    ),
    updateFileBuffer: fromPromise(
      ({
        input,
      }: {
        input: {
          workspacePath: AbsolutePath
          file: FileUpdateBuffer
        }
      }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.updateFileBuffer(input.workspacePath)(input.file)
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
            workspacePath: event.workspacePath,
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
            workspacePath: event.workspacePath,
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
