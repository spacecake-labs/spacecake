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

export interface ElectronAPI {
  showOpenDialog: (options: unknown) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: unknown) => Promise<Electron.SaveDialogReturnValue>;
  readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
  readWorkspace: (dirPath: string) => Promise<ReadWorkspaceResult>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
