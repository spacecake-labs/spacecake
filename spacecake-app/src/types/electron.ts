import type {
  File,
  ReadDirectoryResult,
  ReadWorkspaceResult,
} from "@/types/workspace";

export interface ElectronAPI {
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  showSaveDialog: (options: unknown) => Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
  readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
  readWorkspace: (dirPath: string) => Promise<ReadWorkspaceResult>;
  readFile: (filePath: string) => Promise<{
    success: boolean;
    file?: File;
    error?: string;
  }>;
  createFile: (
    filePath: string,
    content?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  renameFile: (
    oldPath: string,
    newPath: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  deleteFile: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
