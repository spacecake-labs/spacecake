// minimal, typesafe helpers for lexical update tags used in the app

import { Schema } from "effect"
import { SerializedEditorState } from "lexical"

export const INITIAL_LOAD_TAG = "initial-load" as const
export type InitialLoadTag = typeof INITIAL_LOAD_TAG

// view kinds for editor modes
// persistable view kinds are stored in the database
export const PersistableViewKindSchema = Schema.Literal("rich", "source")
export type PersistableViewKind = typeof PersistableViewKindSchema.Type

// ephemeral view kinds are transient overlays (not persisted)
export const EphemeralViewKindSchema = Schema.Literal("diff")
export type EphemeralViewKind = typeof EphemeralViewKindSchema.Type

// full view kind union for UI/routes
export const ViewKindSchema = Schema.Union(PersistableViewKindSchema, EphemeralViewKindSchema)
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
