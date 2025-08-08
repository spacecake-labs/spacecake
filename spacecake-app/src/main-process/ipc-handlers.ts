import { ipcMain, dialog, BrowserWindow } from "electron";
import {
  readDir,
  ensureSpacecakeFolder,
  createFile,
  createFolder,
  readFile,
  renameFile,
  deleteFile,
} from "@/main-process/fs";
import { getWorkspaceName } from "@/main-process/workspace";

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
    // Ensure the .spacecake folder exists
    await ensureSpacecakeFolder(dirPath);

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
    const file = await readFile(filePath);
    return { success: true, file };
  } catch (error) {
    return {
      success: false,
      error: `error reading file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

ipcMain.handle(
  "create-file",
  async (event, filePath: string, content: string = "") => {
    try {
      await createFile(filePath, content);
      return { success: true };
    } catch (error) {
      console.error("error creating file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
);

ipcMain.handle("create-folder", async (event, folderPath: string) => {
  try {
    await createFolder(folderPath);
    return { success: true };
  } catch (error) {
    console.error("error creating folder:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

ipcMain.handle(
  "rename-file",
  async (event, oldPath: string, newPath: string) => {
    try {
      await renameFile(oldPath, newPath);
      return { success: true };
    } catch (error) {
      console.error("error renaming file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
);

ipcMain.handle("delete-file", async (event, filePath: string) => {
  try {
    await deleteFile(filePath);
    return { success: true };
  } catch (error) {
    console.error("error deleting file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});
