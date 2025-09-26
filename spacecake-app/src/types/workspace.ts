/**
 * Workspace and file tree types
 */

import { Schema } from "effect"

import { ViewKindSchema } from "@/types/lexical"
import { encodeBase64Url } from "@/lib/utils"
import { fileTypeFromExtension } from "@/lib/workspace"

export const FileTypeSchema = Schema.Union(
  Schema.Literal("markdown"),
  Schema.Literal("plaintext"),
  Schema.Literal("python"),
  Schema.Literal("javascript"),
  Schema.Literal("typescript"),
  Schema.Literal("jsx"),
  Schema.Literal("tsx")
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
} as const

export const ZERO_HASH = "0000000000000000"

export const WorkspaceInfoSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
})
export type WorkspaceInfo = typeof WorkspaceInfoSchema.Type

export type FileTreeItem = {
  name: string
  path: string
  cid: string
}

export type File = FileTreeItem & {
  kind: "file"
  etag: ETag
  fileType: FileType
  cid: string // Always present - ZERO_HASH for new files, actual hash for changed files
}

export type FileContent = File & { content: string }

export type Folder = FileTreeItem & {
  kind: "folder"
  children: FileTree
  isExpanded: boolean
}

export type FileTree = (File | Folder)[]

export type ETag = { mtimeMs: number; size: number }

export type FileTreeEvent =
  | { kind: "addFile"; path: string; etag: ETag }
  | { kind: "addFolder"; path: string }
  | {
      kind: "contentChange"
      path: string
      etag: ETag
      content: string
      fileType: FileType
      cid: string
    }
  | { kind: "unlinkFile"; path: string }
  | { kind: "unlinkFolder"; path: string }

export type ExpandedFolders = Record<Folder["path"], boolean>

export type QuickOpenFileItem = {
  file: File
  displayPath: string
}

/**
 * Schemas for route params and search params
 */
export const RouteParamsSchema = Schema.Struct({
  workspaceId: Schema.String,
  filePath: Schema.String,
})

export const SearchParamsSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
})

/**
 * Editor context - contains the core data needed for the editor
 * Derived/computed properties are available via EditorContextHelpers
 */
export const EditorContextSchema = Schema.Struct({
  workspacePath: Schema.String,
  filePath: Schema.String,
  viewKind: Schema.String,
})
export type EditorContext = typeof EditorContextSchema.Type

/**
 * Helper functions for computed properties of EditorContext
 */
export const EditorContextHelpers = {
  workspaceName: (ctx: EditorContext) =>
    ctx.workspacePath.split("/").pop() || "spacecake",
  workspaceId: (ctx: EditorContext) => encodeBase64Url(ctx.workspacePath),
  fileName: (ctx: EditorContext) => ctx.filePath.split("/").pop() || "",
  fileType: (ctx: EditorContext) =>
    fileTypeFromExtension(ctx.filePath.split(".").pop() || ""),
}
