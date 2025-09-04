/**
 * Workspace and file tree types
 */

import { Schema } from "effect"

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

export interface WorkspaceInfo {
  path: string
  name: string
}

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
