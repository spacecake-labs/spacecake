import type { ElectronAPI } from "@/types/electron";
import type {
  FileEntry,
  File,
  ReadDirectoryResult,
  WorkspaceInfo,
  ReadWorkspaceResult,
} from "@/types/workspace";

// Re-export shared types for backward compatibility
export type {
  FileEntry,
  File,
  ReadDirectoryResult,
  WorkspaceInfo,
  ReadWorkspaceResult,
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
export {};
