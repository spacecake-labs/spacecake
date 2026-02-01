import { Effect } from "effect"
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate"

import { type EditorSelectionUpdate, type EditorStateUpdate } from "@/schema/editor"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"

export const fileMachine = setup({
  types: {
    events: {} as
      | {
          type: "editor.state.update"
          editorState: EditorStateUpdate
        }
      | {
          type: "editor.selection.update"
          editorSelection: EditorSelectionUpdate
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
          }).pipe(Effect.tapErrorCause(Effect.logError)),
        ),
    ),
    updateEditorSelection: fromPromise(
      ({
        input,
      }: {
        input: {
          editorSelection: EditorSelectionUpdate
        }
      }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            // Assuming this method exists or will be created
            yield* db.updateEditorSelection(input.editorSelection)
          }).pipe(Effect.tapErrorCause(Effect.logError)),
        ),
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
        "editor.selection.update": {
          target: "UpdatingSelection",
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
    UpdatingSelection: {
      invoke: {
        src: "updateEditorSelection",
        input: ({ event }) => {
          assertEvent(event, "editor.selection.update")
          return { editorSelection: event.editorSelection }
        },
        onError: { target: "Idle" },
        onDone: { target: "Idle" },
      },
    },
  },
})

export type FileMachine = typeof fileMachine
export type FileMachineActor = ActorRefFrom<typeof fileMachine>
