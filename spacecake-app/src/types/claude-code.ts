import { Schema } from "effect"

import { SerializedSelectionSchema } from "@/types/lexical"

export type ClaudeCodeStatus = "connected" | "connecting" | "disconnected"

// Claude Code payload schemas
export const ClaudeSelectionSchema = Schema.Struct({
  start: Schema.Struct({
    line: Schema.Number,
    character: Schema.Number,
  }),
  end: Schema.Struct({
    line: Schema.Number,
    character: Schema.Number,
  }),
  isEmpty: Schema.Boolean,
})

export type ClaudeSelection = Schema.Schema.Type<typeof ClaudeSelectionSchema>

export const SelectionChangedPayloadSchema = Schema.Struct({
  text: Schema.String,
  filePath: Schema.String,
  fileUrl: Schema.optional(Schema.String),
  selection: ClaudeSelectionSchema,
})

export type SelectionChangedPayload = Schema.Schema.Type<
  typeof SelectionChangedPayloadSchema
>

export const AtMentionedPayloadSchema = Schema.Struct({
  filePath: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
})

export type AtMentionedPayload = Schema.Schema.Type<
  typeof AtMentionedPayloadSchema
>

export const EditorExtendedSelectionSchema = Schema.Struct({
  selection: SerializedSelectionSchema,
  selectedText: Schema.String,
  claudeSelection: ClaudeSelectionSchema,
})

export type EditorExtendedSelection = Schema.Schema.Type<
  typeof EditorExtendedSelectionSchema
>
