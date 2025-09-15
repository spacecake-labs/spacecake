import { Schema } from "effect"

import { ContextLanguageSchema } from "@/types/language"
import type { FileContent } from "@/types/workspace"

// Discriminated union for block names
export type BlockName =
  | { kind: "anonymous"; value: "anonymous" }
  | { kind: "named"; value: string }

// Helper constructors
export const anonymousName = (): BlockName => ({
  kind: "anonymous",
  value: "anonymous",
})
export const namedBlock = (value: string): BlockName => ({
  kind: "named",
  value,
})

// Type guards
export const isAnonymousName = (
  name: BlockName
): name is { kind: "anonymous"; value: "anonymous" } =>
  name.kind === "anonymous"
export const isNamedBlock = (
  name: BlockName
): name is { kind: "named"; value: string } => name.kind === "named"

export interface Block<TKind = string> {
  kind: TKind
  name: BlockName
  startByte: number
  endByte: number
  text: string
  // 1-based starting line number in the original source file
  startLine: number
  // optional content id for change detection (hash over normalized content)
  cid?: string
  cidAlgo?: string
  doc?: Block<"doc">
}

// Docable block kinds that can have docstrings
export const PyDocableKindSchema = Schema.Union(
  Schema.Literal("module"),
  Schema.Literal("class"),
  Schema.Literal("dataclass"),
  Schema.Literal("function"),
  Schema.Literal("method"),
  Schema.Literal("async function"),
  Schema.Literal("async method"),
  Schema.Literal("decorated class"),
  Schema.Literal("decorated function"),
  Schema.Literal("decorated method")
)
export type PyDocableKind = typeof PyDocableKindSchema.Type

// Non-docable block kinds that cannot have docstrings
export const PyNonDocableKindSchema = Schema.Union(
  Schema.Literal("import"),
  Schema.Literal("main"),
  Schema.Literal("misc")
)
export type PyNonDocableKind = typeof PyNonDocableKindSchema.Type

export const isDocablePyKind = Schema.is(PyDocableKindSchema)

// Overall Python block kind discriminated union
export const PyBlockKindSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("docable"),
    value: PyDocableKindSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("non-docable"),
    value: PyNonDocableKindSchema,
  })
)
export type PyBlockKind = typeof PyBlockKindSchema.Type

// Helper types for async and decorated variants
export type PyAsyncKind =
  `async ${Extract<PyDocableKind, "function" | "method">}`
export type PyDecoratedKind =
  `decorated ${Extract<PyDocableKind, "class" | "function" | "method">}`

type DocableBlock = Block & {
  kind: PyDocableKind
  doc?: Block<"doc">
}

type NonDocableBlock = Block & {
  kind: PyNonDocableKind
}

export type PyBlock = DocableBlock | NonDocableBlock | Block<MdBlockKind>

// markdown block type
export const ContextBlockKindSchema = Schema.Union(
  Schema.Literal("block"),
  Schema.Literal("inline")
)
export type ContextBlockKind = typeof ContextBlockKindSchema.Type

export const ContextBlockSchema = Schema.TemplateLiteral(
  ContextLanguageSchema,
  " ",
  ContextBlockKindSchema
)
export type ContextBlock = typeof ContextBlockSchema.Type

export const MdBlockSchema = ContextBlockSchema.pipe(
  Schema.pickLiteral("markdown block", "markdown inline")
)
export type MdBlockKind = typeof MdBlockSchema.Type

// Parsed file type that extends File with parsed blocks
export interface ParsedFile<TBlock = Block> extends FileContent {
  // Parsed blocks
  blocks: TBlock[]
}

// Python-specific parsed file
export type PyParsedFile = ParsedFile<PyBlock>

// DelimitedString schema and type
export const DelimitedStringSchema = Schema.Struct({
  prefix: Schema.String,
  between: Schema.String,
  suffix: Schema.String,
})
export type DelimitedString = typeof DelimitedStringSchema.Type

// StringDelimiters schema and type (reusing DelimitedString structure)
export const StringDelimitersSchema = DelimitedStringSchema.pick(
  "prefix",
  "suffix"
)
export type StringDelimiters = typeof StringDelimitersSchema.Type

// Regex delimiters schema and type - same structure, different value types
export const RegexDelimitersSchema = Schema.Struct({
  prefix: Schema.instanceOf(RegExp),
  suffix: Schema.instanceOf(RegExp),
})
export type RegexDelimiters = typeof RegexDelimitersSchema.Type

// Comment syntax schemas and types
export const InlineCommentSchema = Schema.Struct({
  kind: Schema.Literal("inline"),
  delimiters: StringDelimitersSchema,
})
export type InlineComment = typeof InlineCommentSchema.Type

export const BlockCommentSchema = Schema.Struct({
  kind: Schema.Literal("block"),
  delimiters: StringDelimitersSchema,
})
export type BlockComment = typeof BlockCommentSchema.Type

export const CommentSyntaxSchema = Schema.Union(
  InlineCommentSchema,
  BlockCommentSchema
)
export type CommentSyntax = typeof CommentSyntaxSchema.Type

// New: Comment syntax map where keys are comment kinds
export const CommentSyntaxMapSchema = Schema.Struct({
  inline: Schema.optional(StringDelimitersSchema), // Optional - language might not support inline
  block: Schema.optional(StringDelimitersSchema), // Optional - language might not support block
})
export type CommentSyntaxMap = typeof CommentSyntaxMapSchema.Type

export const LanguageSyntaxSchema = Schema.Struct({
  comments: CommentSyntaxMapSchema,
  directivePattern: Schema.instanceOf(RegExp),
})
export type LanguageSyntax = typeof LanguageSyntaxSchema.Type

// Directive schema and type
export const DirectiveSchema = Schema.Struct({
  kind: ContextBlockSchema,
  content: DelimitedStringSchema,
})
export type Directive = typeof DirectiveSchema.Type

// ContextBlock schema and type
export const ContextBlockDataSchema = Schema.Struct({
  directive: DirectiveSchema,
  lines: Schema.Array(DelimitedStringSchema),
})
export type ContextBlockData = typeof ContextBlockDataSchema.Type
