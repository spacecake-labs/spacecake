/**
 * Workspace and file tree types
 */

export enum FileType {
  Markdown = "markdown",
  Plaintext = "plaintext",
  Python = "python",
  JavaScript = "javascript",
  TypeScript = "typescript",
  JSX = "jsx",
  TSX = "tsx",
}

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
