import { Schema } from "effect"

export type ClaudeCodeStatus = "connected" | "connecting" | "disconnected"

// Claude Code payload schemas
const SelectionSchema = Schema.Struct({
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

export const SelectionChangedPayloadSchema = Schema.Struct({
  text: Schema.String,
  filePath: Schema.String,
  fileUrl: Schema.optional(Schema.String),
  selection: SelectionSchema,
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
