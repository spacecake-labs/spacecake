import { Schema } from "effect"

import { ViewKindSchema } from "@/types/lexical"
import { FileType } from "@/types/workspace"

export const LanguageSchema = Schema.Union(
  Schema.Literal(FileType.Markdown),
  Schema.Literal(FileType.Python),
  Schema.Literal(FileType.JavaScript),
  Schema.Literal(FileType.TypeScript),
  Schema.Literal(FileType.JSX),
  Schema.Literal(FileType.TSX)
)
export type Language = typeof LanguageSchema.Type

export const ContextLanguageSchema = LanguageSchema.pipe(
  Schema.pickLiteral(FileType.Markdown)
)
export type ContextLanguage = typeof ContextLanguageSchema.Type

export const LanguageSpecSchema = Schema.Struct({
  name: Schema.String,
  code: Schema.String,
  extensions: Schema.Set(Schema.String),
  supportedViews: Schema.Set(ViewKindSchema),
})

export type LanguageSpec = typeof LanguageSpecSchema.Type

export const Languages = Schema.Record({
  key: LanguageSchema,
  value: LanguageSpecSchema,
})
export type Languages = typeof Languages.Type

export const LANGUAGE_SUPPORT: Record<FileType, LanguageSpec> = {
  [FileType.Markdown]: {
    name: "Markdown",
    code: "md",
    extensions: new Set([".md", ".markdown"]),
    supportedViews: new Set(["rich", "source"]),
  },
  [FileType.Python]: {
    name: "Python",
    code: "py",
    extensions: new Set([".py", ".pyw"]),
    supportedViews: new Set(["rich", "source"]),
  },
  [FileType.JavaScript]: {
    name: "JavaScript",
    code: "js",
    extensions: new Set([".js", ".mjs", ".cjs"]),
    supportedViews: new Set(["source"]),
  },
  [FileType.TypeScript]: {
    name: "TypeScript",
    code: "ts",
    extensions: new Set([".ts", ".mts", ".cts"]),
    supportedViews: new Set(["source"]),
  },
  [FileType.JSX]: {
    name: "JSX",
    code: "jsx",
    extensions: new Set([".jsx"]),
    supportedViews: new Set(["source"]),
  },
  [FileType.TSX]: {
    name: "TSX",
    code: "tsx",
    extensions: new Set([".tsx"]),
    supportedViews: new Set(["source"]),
  },
  [FileType.Plaintext]: {
    name: "Plaintext",
    code: "plaintext",
    extensions: new Set([".txt", ".text"]),
    supportedViews: new Set(["source"]),
  },
}
