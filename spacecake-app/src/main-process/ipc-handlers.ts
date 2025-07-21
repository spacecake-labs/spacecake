import { ipcMain, dialog, BrowserWindow } from "electron";
import { readDir } from "@/main-process/fs";
import { getWorkspaceName } from "@/main-process/workspace";
import { promises as fs } from "fs";

// IPC handlers for file dialogs
ipcMain.handle("show-open-dialog", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const result = await dialog.showOpenDialog(win, options);
    return result;
  } else {
    const result = await dialog.showOpenDialog(options);
    return result;
  }
});

ipcMain.handle("show-save-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result;
});

// IPC handlers for file system operations
ipcMain.handle("read-directory", async (event, dirPath: string) => {
  try {
    const files = await readDir(dirPath);
    return { success: true, files };
  } catch (error) {
    console.error("error reading directory:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

ipcMain.handle("read-workspace", async (event, dirPath: string) => {
  try {
    const files = await readDir(dirPath);
    const workspaceName = getWorkspaceName(dirPath, process.platform);

    return {
      success: true,
      files,
      workspace: {
        path: dirPath,
        name: workspaceName,
      },
    };
  } catch (error) {
    console.error("error reading workspace:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

ipcMain.handle("read-file", async (event, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: `error reading file: ${error.message}` };
  }
});
