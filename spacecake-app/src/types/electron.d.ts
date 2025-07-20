export interface ElectronAPI {
  showOpenDialog: (options: any) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: any) => Promise<Electron.SaveDialogReturnValue>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
