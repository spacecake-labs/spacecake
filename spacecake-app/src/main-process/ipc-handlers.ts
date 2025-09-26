import path from "path"

import { setupExitHandlers, type WatchEntry } from "@/main-process/cleanup"
import * as fsEffects from "@/main-process/fs"
import chokidar from "chokidar"
import { Effect, Option as EffectOption } from "effect"
import { BrowserWindow, dialog, ipcMain } from "electron"

import type { ETag, FileTreeEvent } from "@/types/workspace"

// IPC handlers for file dialogs
ipcMain.handle("show-open-dialog", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const result = await dialog.showOpenDialog(win, options)
    return result
  } else {
    const result = await dialog.showOpenDialog(options)
    return result
  }
})

ipcMain.handle("show-save-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(options)
  return result
})

ipcMain.handle("read-file", (_, filePath: string) => {
  const program = Effect.match(fsEffects.readFile(filePath), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: (file) => ({ success: true, file }),
  })
  return fsEffects.run(program)
})

ipcMain.handle("create-file", (_, filePath: string, content: string = "") => {
  const program = Effect.match(fsEffects.createFile(filePath, content), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: () => ({ success: true }),
  })
  return fsEffects.run(program)
})

ipcMain.handle("rename-file", (_, oldPath: string, newPath: string) => {
  const program = Effect.match(fsEffects.renameFile(oldPath, newPath), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: () => ({ success: true }),
  })
  return fsEffects.run(program)
})

ipcMain.handle("delete-file", (_, filePath: string) => {
  const program = Effect.match(fsEffects.deleteFile(filePath), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: () => ({ success: true }),
  })
  return fsEffects.run(program)
})

ipcMain.handle("save-file", (_, filePath: string, content: string) => {
  const program = Effect.gen(function* (_) {
    yield* _(fsEffects.saveFileAtomic(filePath, content))
    const stats = yield* _(fsEffects.statEffect(filePath))
    lastWriteEtag.set(filePath, {
      mtimeMs: EffectOption.getOrElse(
        EffectOption.map(stats.mtime, (d) => d.getTime()),
        () => Date.now()
      ),
      size: Number(stats.size),
    })
  })

  const resultProgram = Effect.match(program, {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: () => ({ success: true }),
  })

  return fsEffects.run(resultProgram)
})

const watchers = new Map<string, WatchEntry>()
const lastWriteEtag = new Map<string, { mtimeMs: number; size: number }>()
const ZERO_ETAG: ETag = { mtimeMs: 0, size: 0 }

// Setup exit handlers for cleanup
setupExitHandlers(watchers)

const emitInitialSnapshotFromWatcher = (
  watcher: chokidar.FSWatcher,
  rootPath: string,
  send: (evt: FileTreeEvent) => void
) => {
  const watched = watcher.getWatched() // { [dir]: string[] }
  // emit folders first (excluding the root itself)
  for (const dir of Object.keys(watched)) {
    if (dir === rootPath) continue
    send({ kind: "addFolder", path: dir })
  }
  // emit files using directory listings; a path is a folder if it is a key in getWatched()
  for (const [dir, names] of Object.entries(watched)) {
    for (const name of names) {
      const full = path.join(dir, name)
      if (watched[full]) {
        // it’s a folder; already emitted above
        continue
      }
      send({ kind: "addFile", path: full, etag: ZERO_ETAG })
    }
  }
}

ipcMain.handle("watch-workspace", async (event, workspacePath: string) => {
  const program = Effect.gen(function* (_) {
    const stats = yield* _(fsEffects.statEffect(workspacePath))
    if (stats.type !== "Directory") {
      return yield* _(
        Effect.fail({
          success: false,
          error: `path is not a directory: ${workspacePath}`,
        })
      )
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    let entry = watchers.get(workspacePath)
    if (entry) {
      if (win) {
        entry.targetIds.add(win.id)

        // synthesize initial state from the existing watcher (no fs.readdir)
        emitInitialSnapshotFromWatcher(entry.watcher, workspacePath, (evt) => {
          if (!win.isDestroyed()) win.webContents.send("file-event", evt)
        })
      }
      return { success: true }
    }

    const watcher = chokidar.watch(workspacePath, {
      persistent: true,
      ignoreInitial: false, // will emit initial add/addDir for the first-attached renderer
      ignored: ["**/node_modules/**", "**/.git/**", "**/.DS_Store"],
      depth: Infinity,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      atomic: true,
      alwaysStat: true,
    })

    entry = { watcher, targetIds: new Set<number>() }
    if (win) entry.targetIds.add(win.id)

    const emit = (evt: FileTreeEvent) => {
      for (const id of entry!.targetIds) {
        const w = BrowserWindow.fromId(id)
        if (w && !w.isDestroyed()) w.webContents.send("file-event", evt)
      }
    }

    watcher
      .on("add", (p, stats) => {
        const etag: ETag = {
          mtimeMs: stats?.mtimeMs ?? Date.now(),
          size: stats?.size ?? 0,
        }
        emit({ kind: "addFile", path: p, etag })
      })
      .on("change", async (p, stats) => {
        const etag: ETag = {
          mtimeMs: stats?.mtimeMs ?? Date.now(),
          size: stats?.size ?? 0,
        }

        const readProgram = Effect.gen(function* (_) {
          const file = yield* _(fsEffects.readFile(p))
          const { fnv1a64Hex } = yield* _(
            Effect.promise(() => import("@/lib/hash"))
          )
          const newContentHash = fnv1a64Hex(file.content)
          emit({
            kind: "contentChange",
            path: p,
            etag,
            content: file.content,
            fileType: file.fileType,
            cid: newContentHash,
          })
        })

        Effect.runPromise(Effect.provide(readProgram, fsEffects.FsLive)).catch(
          (error) => {
            console.error("error reading file for content change:", error)
          }
        )
      })
      .on("unlink", (p) => emit({ kind: "unlinkFile", path: p }))
      .on("addDir", (p) => emit({ kind: "addFolder", path: p }))
      .on("unlinkDir", (p) => emit({ kind: "unlinkFolder", path: p }))

    watchers.set(workspacePath, entry)
    return { success: true }
  })

  return fsEffects.run(program).catch((error) => {
    console.error("error starting watcher:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    }
  })
})

ipcMain.handle("stop-watching", async (event, workspacePath: string) => {
  try {
    const entry = watchers.get(workspacePath)
    if (entry) {
      await entry.watcher.close()
      watchers.delete(workspacePath)
      console.log(`stopped watching: ${workspacePath}`)
      return { success: true }
    } else {
      return { success: false, error: "no watcher found" }
    }
  } catch (error) {
    console.error("error stopping watcher:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
})

ipcMain.handle("create-folder", (_, folderPath: string) => {
  const program = Effect.match(fsEffects.createFolder(folderPath), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: () => ({ success: true }),
  })
  return fsEffects.run(program)
})

ipcMain.handle("path-exists", (_, path: string) => {
  const program = Effect.match(fsEffects.existsEffect(path), {
    onFailure: (error) => ({ success: false, error: error.message }),
    onSuccess: (exists) => ({ success: true, exists }),
  })
  return fsEffects.run(program)
})
