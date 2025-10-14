import { type EditorStateUpdate } from "@/schema/editor"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

export const fileMachine = setup({
  types: {
    events: {} as {
      type: "editor.state.update"
      editorState: EditorStateUpdate
    },
  },
  actors: {
    updateEditorState: fromPromise(
      ({
        input,
      }: {
        input: {
          editorState: EditorStateUpdate
        }
      }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.updateEditorState(input.editorState)
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
        "editor.state.update": {
          target: "updatingBuffer",
        },
      },
    },
    updatingBuffer: {
      invoke: {
        src: "updateEditorState",
        input: ({ event }) => {
          assertEvent(event, "editor.state.update")
          return {
            editorState: event.editorState,
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
