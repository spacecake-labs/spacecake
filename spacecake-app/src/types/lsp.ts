import * as Schema from "effect/Schema"

// 0-based line and character position (LSP standard)
export const LspPositionSchema = Schema.Struct({
  line: Schema.Number,
  character: Schema.Number,
})
export type LspPosition = typeof LspPositionSchema.Type

// directional selection: anchor is where the user started, head is where they ended.
// anchor can be after head for backward selections.
export const LspSelectionSchema = Schema.Struct({
  _tag: Schema.Literal("Lsp"),
  anchor: LspPositionSchema,
  head: LspPositionSchema,
})
export type LspSelection = typeof LspSelectionSchema.Type
