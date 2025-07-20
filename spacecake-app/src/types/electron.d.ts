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

export interface ElectronAPI {
  showOpenDialog: (options: any) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: any) => Promise<Electron.SaveDialogReturnValue>;
  readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
