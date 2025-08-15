import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import chokidar from "chokidar";
import {
  readDir,
  ensureSpacecakeFolder,
  createFile,
  createFolder,
  readFile,
  renameFile,
  deleteFile,
  saveFileAtomic,
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

// file system watcher for external changes
const watchers = new Map<string, chokidar.FSWatcher>();
// remember last write etag per path to suppress self-save watcher echoes
const lastWriteEtag = new Map<string, { mtimeMs: number; size: number }>();

ipcMain.handle("watch-workspace", async (event, workspacePath: string) => {
  try {
    // reuse existing watcher for this path
    if (watchers.has(workspacePath)) {
      return { success: true };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const watcher = chokidar.watch(workspacePath, {
      ignoreInitial: true,
      ignored: ["**/node_modules/**", "**/.git/**", "**/.DS_Store"],
      persistent: true,
      depth: Infinity,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      atomic: true,
      alwaysStat: true,
    });

    const emit = (
      type: "add" | "change" | "unlink",
      path: string,
      stats?: import("fs").Stats
    ) => {
      const etag = stats ? { mtimeMs: stats.mtimeMs, size: stats.size } : null;
      const tsMs = Date.now();
      const last = lastWriteEtag.get(path);
      if (
        etag &&
        last &&
        etag.mtimeMs === last.mtimeMs &&
        etag.size === last.size
      ) {
        return;
      }
      win?.webContents.send("file-event", { type, path, etag, tsMs });
    };

    watcher
      .on("add", (path, stats) => emit("add", path, stats))
      .on("change", (path, stats) => emit("change", path, stats))
      .on("unlink", (path) => emit("unlink", path));

    watchers.set(workspacePath, watcher);
    return { success: true };
  } catch (error) {
    console.error("error starting watcher:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

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

// removed unused stat-file handler; etag suppression occurs in-process after save

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

ipcMain.handle(
  "save-file",
  async (event, filePath: string, content: string) => {
    try {
      await saveFileAtomic(filePath, content);
      try {
        const st = await fs.promises.stat(filePath);
        lastWriteEtag.set(filePath, { mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // ignore inability to stat saved file for etag recording
      }
      return { success: true };
    } catch (error) {
      console.error("error saving file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
);
