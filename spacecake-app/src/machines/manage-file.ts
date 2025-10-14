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
  initial: "Idle",
  states: {
    Idle: {
      on: {
        "editor.state.update": {
          target: "UpdatingState",
        },
      },
    },
    UpdatingState: {
      invoke: {
        src: "updateEditorState",
        input: ({ event }) => {
          assertEvent(event, "editor.state.update")
          return {
            editorState: event.editorState,
          }
        },
        onError: { target: "Idle" },
        onDone: { target: "Idle" },
      },
    },
  },
})

export type FileMachine = typeof fileMachine
export type FileMachineActor = ActorRefFrom<typeof fileMachine>
