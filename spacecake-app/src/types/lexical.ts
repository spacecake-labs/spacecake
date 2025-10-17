// minimal, typesafe helpers for lexical update tags used in the app

import { Schema } from "effect"
import { SerializedEditorState } from "lexical"

export const INITIAL_LOAD_TAG = "initial-load" as const
export type InitialLoadTag = typeof INITIAL_LOAD_TAG

// view kinds for editor modes
export const ViewKindSchema = Schema.Literal("rich", "source")

export type ViewKind = typeof ViewKindSchema.Type

export const SerializedSelectionSchema = Schema.Struct({
  anchor: Schema.Struct({
    key: Schema.String,
    offset: Schema.Number,
  }),
  focus: Schema.Struct({
    key: Schema.String,
    offset: Schema.Number,
  }),
})

export type SerializedSelection = typeof SerializedSelectionSchema.Type

export type EditorStateAndSelection = {
  state: SerializedEditorState
  selection: SerializedSelection | null
}

export type ChangeType = "selection" | "content"
