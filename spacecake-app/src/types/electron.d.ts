import type { ElectronAPI } from "@/types/electron";
import { FileType } from "@/components/editor/editor";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  isDirectory: boolean;
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

export interface File extends FileEntry {
  content: string;
  fileType: FileType;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
export {};
