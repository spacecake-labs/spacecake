import { Option, Schema } from "effect"

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
  extensions: Schema.Array(Schema.String),
})

export type LanguageSpec = typeof LanguageSpecSchema.Type

export const Languages = Schema.Record({
  key: LanguageSchema,
  value: LanguageSpecSchema,
})
export type Languages = typeof Languages.Type

export const LANGUAGES: Languages = {
  [FileType.Markdown]: {
    name: "Markdown",
    code: "md",
    extensions: [".md", ".markdown"],
  },
  [FileType.Python]: {
    name: "Python",
    code: "py",
    extensions: [".py", ".pyw"],
  },
  [FileType.JavaScript]: {
    name: "JavaScript",
    code: "js",
    extensions: [".js", ".mjs", ".cjs"],
  },
  [FileType.TypeScript]: {
    name: "TypeScript",
    code: "ts",
    extensions: [".ts", ".mts", ".cts"],
  },
  [FileType.JSX]: {
    name: "JSX",
    code: "jsx",
    extensions: [".jsx"],
  },
  [FileType.TSX]: {
    name: "TSX",
    code: "tsx",
    extensions: [".tsx"],
  },
}

// A Language is any FileType that can be used in directives.
// We explicitly exclude Plaintext for now.
// export type Language = Exclude<FileType, FileType.Plaintext>

/**
 * Defines the properties of a supported language.
 */
// export interface LanguageSpec {
//   /** The human-friendly name, e.g., "Python" */
//   name: string
//   /** The short code used for directives, e.g., "py" */
//   code: string
//   /** Associated file extensions for this language */
//   extensions: string[]
// }

/**
 * The single source of truth for language specifications.
 * The key is the canonical `Language` ID (which is a `FileType`).
 */
// export const LANGUAGES: Record<Language, LanguageSpec> = {
//   [FileType.Markdown]: {
//     name: "Markdown",
//     code: "md",
//     extensions: [".md", ".markdown"],
//   },
//   [FileType.Python]: {
//     name: "Python",
//     code: "py",
//     extensions: [".py", ".pyw"],
//   },
//   [FileType.JavaScript]: {
//     name: "JavaScript",
//     code: "js",
//     extensions: [".js", ".mjs", ".cjs"],
//   },
//   [FileType.TypeScript]: {
//     name: "TypeScript",
//     code: "ts",
//     extensions: [".ts", ".mts", ".cts"],
//   },
//   [FileType.JSX]: {
//     name: "JSX",
//     code: "jsx",
//     extensions: [".jsx"],
//   },
//   [FileType.TSX]: {
//     name: "TSX",
//     code: "tsx",
//     extensions: [".tsx"],
//   },
// }

/**
 * A lookup map to resolve a string (e.g., "md", "python") to a canonical
 * `Language` ID.
 */
export const LANGUAGE_LOOKUP: Map<string, Language> = new Map()
for (const [id, spec] of Object.entries(LANGUAGES) as [
  Language,
  LanguageSpec,
][]) {
  // "markdown" -> FileType.Markdown
  LANGUAGE_LOOKUP.set(id.toLowerCase(), id)
  // "md" -> FileType.Markdown
  LANGUAGE_LOOKUP.set(spec.code.toLowerCase(), id)
}

/**
 * Resolves a string alias (e.g., "md", "python") to a canonical `Language` ID.
 * The lookup is case-insensitive.
 * @param str The string to resolve.
 * @returns The canonical `Language` ID or `null` if not found.
 */
export function fromString(str: string): Language | null {
  return LANGUAGE_LOOKUP.get(str.toLowerCase()) ?? null
}

/**
 * Retrieves the full specification for a given canonical `Language` ID.
 * @param lang The canonical `Language` ID.
 * @returns The `LanguageSpec` for the given language.
 */
export function getSpec(lang: Language): LanguageSpec {
  return LANGUAGES[lang]
}

export function contextLanguageFromCode(
  code: string
): Option.Option<ContextLanguage> {
  switch (code) {
    case "md":
      return Option.some(FileType.Markdown)
    default:
      return Option.none()
  }
}
