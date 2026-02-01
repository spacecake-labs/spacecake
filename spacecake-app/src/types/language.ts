import { Schema } from "effect"

import { ViewKindSchema } from "@/types/lexical"
import { FileType } from "@/types/workspace"

export const LanguageSchema = Schema.Union(
  Schema.Literal(FileType.Markdown),
  Schema.Literal(FileType.Python),
  Schema.Literal(FileType.JavaScript),
  Schema.Literal(FileType.TypeScript),
  Schema.Literal(FileType.JSX),
  Schema.Literal(FileType.TSX),
  Schema.Literal(FileType.Rust),
  Schema.Literal(FileType.Go),
  Schema.Literal(FileType.C),
  Schema.Literal(FileType.Cpp),
  Schema.Literal(FileType.CSharp),
  Schema.Literal(FileType.Java),
  Schema.Literal(FileType.Swift),
  Schema.Literal(FileType.Kotlin),
  Schema.Literal(FileType.JSON),
  Schema.Literal(FileType.YAML),
  Schema.Literal(FileType.TOML),
  Schema.Literal(FileType.CSS),
  Schema.Literal(FileType.Shell),
  Schema.Literal(FileType.Bash),
  Schema.Literal(FileType.Zsh),
  Schema.Literal(FileType.XML),
)
export type Language = typeof LanguageSchema.Type

export const ContextLanguageSchema = LanguageSchema.pipe(Schema.pickLiteral(FileType.Markdown))
export type ContextLanguage = typeof ContextLanguageSchema.Type

export const LanguageSpecSchema = Schema.Struct({
  name: Schema.String,
  code: Schema.String,
  extensions: Schema.Set(Schema.String),
  supportedViews: Schema.Set(ViewKindSchema),
  codemirrorName: Schema.String,
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
    codemirrorName: "markdown",
  },
  [FileType.Python]: {
    name: "Python",
    code: "py",
    extensions: new Set([".py", ".pyw"]),
    supportedViews: new Set(["rich", "source"]),
    codemirrorName: "python",
  },
  [FileType.JavaScript]: {
    name: "JavaScript",
    code: "js",
    extensions: new Set([".js", ".mjs", ".cjs"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "javascript",
  },
  [FileType.TypeScript]: {
    name: "TypeScript",
    code: "ts",
    extensions: new Set([".ts", ".mts", ".cts"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "typescript",
  },
  [FileType.JSX]: {
    name: "JSX",
    code: "jsx",
    extensions: new Set([".jsx"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "jsx",
  },
  [FileType.TSX]: {
    name: "TSX",
    code: "tsx",
    extensions: new Set([".tsx"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "tsx",
  },
  [FileType.Rust]: {
    name: "Rust",
    code: "rs",
    extensions: new Set([".rs"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "rust",
  },
  [FileType.Go]: {
    name: "Go",
    code: "go",
    extensions: new Set([".go"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "go",
  },
  [FileType.C]: {
    name: "C",
    code: "c",
    extensions: new Set([".c", ".h"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "c",
  },
  [FileType.Cpp]: {
    name: "C++",
    code: "cpp",
    extensions: new Set([".cpp", ".cc", ".cxx", ".hpp", ".h"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "cpp",
  },
  [FileType.CSharp]: {
    name: "C#",
    code: "csharp",
    extensions: new Set([".cs"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "csharp",
  },
  [FileType.Java]: {
    name: "Java",
    code: "java",
    extensions: new Set([".java"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "java",
  },
  [FileType.Swift]: {
    name: "Swift",
    code: "swift",
    extensions: new Set([".swift"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "swift",
  },
  [FileType.Kotlin]: {
    name: "Kotlin",
    code: "kt",
    extensions: new Set([".kt", ".kts"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "kotlin",
  },
  [FileType.JSON]: {
    name: "JSON",
    code: "json",
    extensions: new Set([".json"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "json",
  },
  [FileType.YAML]: {
    name: "YAML",
    code: "yaml",
    extensions: new Set([".yaml", ".yml"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "yaml",
  },
  [FileType.TOML]: {
    name: "TOML",
    code: "toml",
    extensions: new Set([".toml"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "toml",
  },
  [FileType.Plaintext]: {
    name: "Plaintext",
    code: "plaintext",
    extensions: new Set([".txt", ".text"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "plaintext",
  },
  [FileType.CSS]: {
    name: "CSS",
    code: "css",
    extensions: new Set([".css"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "css",
  },
  [FileType.Shell]: {
    name: "Shell",
    code: "sh",
    extensions: new Set([".sh", ".ksh"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "shell",
  },
  [FileType.Bash]: {
    name: "Bash",
    code: "bash",
    extensions: new Set([".bash"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "shell",
  },
  [FileType.Zsh]: {
    name: "Zsh",
    code: "zsh",
    extensions: new Set([".zsh"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "shell",
  },
  [FileType.XML]: {
    name: "XML",
    code: "xml",
    extensions: new Set([".xml", ".xsl", ".xslt", ".xsd", ".svg", ".plist"]),
    supportedViews: new Set(["source"]),
    codemirrorName: "xml",
  },
}
