/**
 * Workspace-related types that can be used by both main and renderer processes
 * This file should not import any React components or renderer-specific code
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

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  isDirectory: boolean;
}

export interface File extends FileEntry {
  content: string;
  fileType: FileType;
}

export interface ReadDirectoryResult {
  success: boolean;
  files?: FileEntry[];
  error?: string;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface ReadWorkspaceResult {
  success: boolean;
  files?: FileEntry[];
  workspace?: WorkspaceInfo;
  error?: string;
}
