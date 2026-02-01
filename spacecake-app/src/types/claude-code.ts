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

export type SelectionChangedPayload = Schema.Schema.Type<typeof SelectionChangedPayloadSchema>

export const AtMentionedPayloadSchema = Schema.Struct({
  filePath: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
})

export type AtMentionedPayload = Schema.Schema.Type<typeof AtMentionedPayloadSchema>

// openFile tool arguments from Claude Code
export const OpenFileArgsSchema = Schema.Struct({
  filePath: Schema.String,
  preview: Schema.optional(Schema.Boolean),
  startText: Schema.optional(Schema.String),
  endText: Schema.optional(Schema.String),
  selectToEndOfLine: Schema.optional(Schema.Boolean),
  makeFrontmost: Schema.optionalWith(Schema.Boolean, { default: () => true }),
})

export type OpenFileArgs = Schema.Schema.Type<typeof OpenFileArgsSchema>

// Source of who opened the file - used for UI indicators
export type OpenFileSource = "claude" | "cli"

// Payload sent from main process to renderer for open file
export interface OpenFilePayload {
  workspacePath: string
  filePath: string
  line?: number
  col?: number
  source?: OpenFileSource
}

export const EditorExtendedSelectionSchema = Schema.Struct({
  selection: SerializedSelectionSchema,
  selectedText: Schema.String,
  claudeSelection: ClaudeSelectionSchema,
})

export type EditorExtendedSelection = Schema.Schema.Type<typeof EditorExtendedSelectionSchema>
