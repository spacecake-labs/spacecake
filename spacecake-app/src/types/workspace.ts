/**
 * Workspace and file tree types
 */

import { Brand, Schema } from "effect"

import { encodeBase64Url } from "@/lib/utils"
import { fileTypeFromExtension } from "@/lib/workspace"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { JsonValue } from "@/schema/drizzle-effect"
import { SerializedSelection, ViewKind, ViewKindSchema } from "@/types/lexical"

export type RelativePath = string & Brand.Brand<"RelativePath">
export const RelativePath = Brand.nominal<RelativePath>()
export const RelativePathSchema = Schema.String.pipe(Schema.fromBrand(RelativePath))

export type AbsolutePath = string & Brand.Brand<"AbsolutePath">
export const AbsolutePath = Brand.nominal<AbsolutePath>()
export const AbsolutePathSchema = Schema.String.pipe(Schema.fromBrand(AbsolutePath))

export const FileTypeSchema = Schema.Union(
  Schema.Literal("markdown"),
  Schema.Literal("plaintext"),
  Schema.Literal("python"),
  Schema.Literal("javascript"),
  Schema.Literal("typescript"),
  Schema.Literal("jsx"),
  Schema.Literal("tsx"),
  Schema.Literal("rust"),
  Schema.Literal("go"),
  Schema.Literal("c"),
  Schema.Literal("cpp"),
  Schema.Literal("csharp"),
  Schema.Literal("java"),
  Schema.Literal("swift"),
  Schema.Literal("kotlin"),
  Schema.Literal("json"),
  Schema.Literal("yaml"),
  Schema.Literal("toml"),
  Schema.Literal("css"),
  Schema.Literal("shell"),
  Schema.Literal("bash"),
  Schema.Literal("zsh"),
  Schema.Literal("xml"),
)
export type FileType = typeof FileTypeSchema.Type

// Export constants for the values
export const FileType = {
  Markdown: "markdown" as const,
  Plaintext: "plaintext" as const,
  Python: "python" as const,
  JavaScript: "javascript" as const,
  TypeScript: "typescript" as const,
  JSX: "jsx" as const,
  TSX: "tsx" as const,
  Rust: "rust" as const,
  Go: "go" as const,
  C: "c" as const,
  Cpp: "cpp" as const,
  CSharp: "csharp" as const,
  Java: "java" as const,
  Swift: "swift" as const,
  Kotlin: "kotlin" as const,
  JSON: "json" as const,
  YAML: "yaml" as const,
  TOML: "toml" as const,
  CSS: "css" as const,
  Shell: "shell" as const,
  Bash: "bash" as const,
  Zsh: "zsh" as const,
  XML: "xml" as const,
} as const

export const ZERO_HASH = "0000000000000000"

export const WorkspaceInfoSchema = Schema.Struct({
  path: AbsolutePathSchema,
  name: Schema.String,
})
export type WorkspaceInfo = typeof WorkspaceInfoSchema.Type

export type FileTreeItem = {
  name: string
  path: AbsolutePath
  cid: string
}

export type File = FileTreeItem & {
  kind: "file"
  etag: ETag
  fileType: FileType
  isGitIgnored?: boolean
}

export type FileContent = File & { content: string }

export type EditorFile = {
  fileId: FilePrimaryKey
  editorId: EditorPrimaryKey
  path: AbsolutePath
  fileType: FileType
  content: string
  cid: string
  selection: SerializedSelection | null
}

export type EditorCache = {
  editorId: EditorPrimaryKey
  state: JsonValue
  viewKind: ViewKind
  fileId: FilePrimaryKey
  selection: SerializedSelection | null
}

export type Folder = FileTreeItem & {
  kind: "folder"
  children: FileTree
  isExpanded: boolean
  isGitIgnored?: boolean
  isSystemFolder?: boolean
}

export type FileTree = (File | Folder)[]

export type ETag = { mtime: Date; size: number }

export type FileTreeEvent =
  | { kind: "addFile"; path: AbsolutePath; etag: ETag }
  | { kind: "addFolder"; path: AbsolutePath }
  | {
      kind: "contentChange"
      path: AbsolutePath
      etag: ETag
      content: string
      fileType: FileType
      cid: string
    }
  | { kind: "unlinkFile"; path: AbsolutePath }
  | { kind: "unlinkFolder"; path: AbsolutePath }

export type ExpandedFolders = Record<Folder["path"], boolean>

export type QuickOpenFileItem = {
  file: File
  displayPath: string
}

/**
 * Schemas for route params and search params
 */
export const RouteParamsSchema = Schema.Struct({
  workspaceId: AbsolutePathSchema,
  filePath: RelativePathSchema,
})

export const SearchParamsSchema = Schema.Struct({
  view: ViewKindSchema,
})

/**
 * Editor context - contains the core data needed for the editor
 * Derived/computed properties are available via RouteContextHelpers
 */
export const RouteContextSchema = Schema.Struct({
  workspaceId: Schema.String,
  filePath: AbsolutePathSchema,
  viewKind: Schema.optional(ViewKindSchema),
  fileType: FileTypeSchema,
  baseRef: Schema.optional(Schema.String),
  targetRef: Schema.optional(Schema.String),
})
export type RouteContext = typeof RouteContextSchema.Type

/**
 * Helper functions for computed properties of RouteContext
 */
export const RouteContextHelpers = {
  workspaceName: (ctx: RouteContext) => ctx.workspaceId.split("/").pop() || "spacecake",
  workspaceId: (ctx: RouteContext) => encodeBase64Url(ctx.workspaceId),
  fileName: (ctx: RouteContext) => ctx.filePath.split("/").pop() || "",
  fileType: (ctx: RouteContext) => fileTypeFromExtension(ctx.filePath.split(".").pop() || ""),
  workspacePath: (ctx: RouteContext) => encodeBase64Url(ctx.workspaceId),
}
