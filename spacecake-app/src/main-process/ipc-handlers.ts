import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import chokidar from "chokidar";
import {
  createFile,
  createFolder,
  readFile,
  renameFile,
  deleteFile,
  saveFileAtomic,
} from "@/main-process/fs";
import type { FileTreeEvent, ETag } from "@/types/workspace";
import path from "path";
import { setupExitHandlers, type WatchEntry } from "@/main-process/cleanup";

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
      // Create the file
      await createFile(filePath, content);

      // Wait for the chokidar event to confirm the file exists
      const watcherData = getWatcherEntry(event, filePath);
      if (!watcherData)
        return { success: false, error: "no watcher or window" };
      const { entry } = watcherData;

      // Wait for the add event (with timeout)
      return waitForChokidarEvent(
        entry,
        "add",
        filePath,
        2000,
        "timeout waiting for file event"
      );
    } catch (error) {
      console.error("error creating file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
);

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
    // Check if it's a directory BEFORE deleting
    const isDirectory = fs.statSync(filePath).isDirectory();
    const eventType = isDirectory ? "unlinkDir" : "unlink";

    // Delete the file/folder
    await deleteFile(filePath);

    // Wait for the chokidar event to confirm deletion
    const watcherData = getWatcherEntry(event, filePath);
    if (!watcherData) return { success: false, error: "no watcher or window" };
    const { entry } = watcherData;

    // Wait for the appropriate event (with timeout)
    return waitForChokidarEvent(
      entry,
      eventType,
      filePath,
      2000,
      `timeout waiting for ${isDirectory ? "folder" : "file"} deletion event`
    );
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

const watchers = new Map<string, WatchEntry>();
const lastWriteEtag = new Map<string, { mtimeMs: number; size: number }>();
const ZERO_ETAG: ETag = { mtimeMs: 0, size: 0 };

// Setup exit handlers for cleanup
setupExitHandlers(watchers);

/**
 * Helper function to get the watcher entry for a given file path
 * @param event - The IPC event
 * @param filePath - The file path to get the watcher for
 * @returns The watcher entry and workspace path, or null if not found
 */
function getWatcherEntry(
  event: Electron.IpcMainInvokeEvent,
  filePath: string
): {
  entry: WatchEntry;
  workspacePath: string;
  win: BrowserWindow;
} | null {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;

  // Find the watcher by checking if the filePath is within any watched workspace
  for (const [workspacePath, entry] of watchers.entries()) {
    if (filePath.startsWith(workspacePath)) {
      return { entry, workspacePath, win };
    }
  }

  return null;
}

/**
 * Helper function to wait for a specific chokidar event
 * @param entry - The watcher entry
 * @param eventType - The chokidar event type to wait for
 * @param expectedPath - The expected file path
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Error message for timeout
 * @returns Promise that resolves to success/failure
 */
function waitForChokidarEvent(
  entry: WatchEntry,
  eventType: "add" | "unlink" | "unlinkDir",
  expectedPath: string,
  timeoutMs: number = 2000,
  errorMessage: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Check if the event already happened (for add events, check if file exists)
    if (eventType === "add") {
      if (fs.existsSync(expectedPath)) {
        resolve({ success: true });
        return;
      }
    }

    const timeout = setTimeout(() => {
      resolve({ success: false, error: errorMessage });
    }, timeoutMs);

    const onEvent = (p: string) => {
      if (p === expectedPath) {
        clearTimeout(timeout);
        entry.watcher.off(eventType, onEvent);
        resolve({ success: true });
      }
    };

    entry.watcher.on(eventType, onEvent);
  });
}

const emitInitialSnapshotFromWatcher = (
  watcher: chokidar.FSWatcher,
  rootPath: string,
  send: (evt: FileTreeEvent) => void
) => {
  const watched = watcher.getWatched(); // { [dir]: string[] }
  // emit folders first (excluding the root itself)
  for (const dir of Object.keys(watched)) {
    if (dir === rootPath) continue;
    send({ kind: "addFolder", path: dir });
  }
  // emit files using directory listings; a path is a folder if it is a key in getWatched()
  for (const [dir, names] of Object.entries(watched)) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (watched[full]) {
        // it’s a folder; already emitted above
        continue;
      }
      send({ kind: "addFile", path: full, etag: ZERO_ETAG });
    }
  }
};

ipcMain.handle("watch-workspace", async (event, workspacePath: string) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    let entry = watchers.get(workspacePath);
    if (entry) {
      if (win) {
        entry.targetIds.add(win.id);

        // synthesize initial state from the existing watcher (no fs.readdir)
        emitInitialSnapshotFromWatcher(entry.watcher, workspacePath, (evt) => {
          if (!win.isDestroyed()) win.webContents.send("file-event", evt);
        });
      }
      return { success: true };
    }

    const watcher = chokidar.watch(workspacePath, {
      persistent: true,
      ignoreInitial: false, // will emit initial add/addDir for the first-attached renderer
      ignored: ["**/node_modules/**", "**/.git/**", "**/.DS_Store"],
      depth: Infinity,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      atomic: true,
      alwaysStat: true,
    });

    entry = { watcher, targetIds: new Set<number>() };
    if (win) entry.targetIds.add(win.id);

    const emit = (evt: FileTreeEvent) => {
      for (const id of entry!.targetIds) {
        const w = BrowserWindow.fromId(id);
        if (w && !w.isDestroyed()) w.webContents.send("file-event", evt);
      }
    };

    watcher
      .on("add", (p, stats) => {
        const etag: ETag = {
          mtimeMs: stats?.mtimeMs ?? Date.now(),
          size: stats?.size ?? 0,
        };
        emit({ kind: "addFile", path: p, etag });
      })
      .on("change", async (p, stats) => {
        const etag: ETag = {
          mtimeMs: stats?.mtimeMs ?? Date.now(),
          size: stats?.size ?? 0,
        };

        try {
          const { readFile } = await import("@/main-process/fs");
          const file = await readFile(p);
          if (file) {
            // Calculate content hash using existing fnv1a64Hex function
            const { fnv1a64Hex } = await import("@/lib/hash");
            const newContentHash = fnv1a64Hex(file.content);

            // Check if content hash has changed by comparing with previous hash
            // For now, we'll always emit since we don't have previous hash storage
            // In the future, we could store previous hashes in a Map for comparison
            emit({
              kind: "contentChange",
              path: p,
              etag,
              content: file.content,
              fileType: file.fileType,
              cid: newContentHash,
            });
          }
        } catch (error) {
          console.error("error reading file for content change:", error);
        }
      })
      .on("unlink", (p) => emit({ kind: "unlinkFile", path: p }))
      .on("addDir", (p) => emit({ kind: "addFolder", path: p }))
      .on("unlinkDir", (p) => emit({ kind: "unlinkFolder", path: p }));

    watchers.set(workspacePath, entry);
    return { success: true };
  } catch (error) {
    console.error("error starting watcher:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

ipcMain.handle("stop-watching", async (event, workspacePath: string) => {
  try {
    const entry = watchers.get(workspacePath);
    if (entry) {
      entry.watcher.close();
      watchers.delete(workspacePath);
      console.log(`stopped watching: ${workspacePath}`);
      return { success: true };
    }
    return { success: false, error: "no watcher found" };
  } catch (error) {
    console.error("error stopping watcher:", error);
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
