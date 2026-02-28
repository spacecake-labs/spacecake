import { BrowserWindow, ipcMain } from "electron"
import fs from "node:fs"
import path from "node:path"

export type MigrationResult = "migrated" | "fresh-install"

const MIGRATION_TIMEOUT_MS = 30_000

/**
 * orchestrates a one-time PGlite migration from IndexedDB (renderer) to filesystem (main).
 *
 * creates a hidden BrowserWindow that opens the old `idb://spacecake` PGlite,
 * dumps the data directory, and sends it back via IPC. the dump is written to
 * disk as a crash-safe checkpoint before the window is destroyed (freeing all
 * WASM memory).
 */
export async function migratePgliteFromIdb(
  appDir: string,
  dumpPath: string,
): Promise<MigrationResult> {
  return new Promise<MigrationResult>((resolve) => {
    let settled = false
    let migrationWindow: BrowserWindow | null = null

    const cleanup = () => {
      ipcMain.removeHandler("migration:idb-dump")
      if (migrationWindow && !migrationWindow.isDestroyed()) {
        migrationWindow.destroy()
      }
      migrationWindow = null
    }

    const settle = (result: MigrationResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    // safety valve — if the renderer hangs, fall back to fresh install
    const timeout = setTimeout(() => {
      console.warn("migration: timed out waiting for IndexedDB dump, falling back to fresh install")
      settle("fresh-install")
    }, MIGRATION_TIMEOUT_MS)
    timeout.unref()

    ipcMain.handle("migration:idb-dump", async (_event, dump: ArrayBuffer | null) => {
      clearTimeout(timeout)

      if (!dump) {
        settle("fresh-install")
        return
      }

      try {
        fs.mkdirSync(path.dirname(dumpPath), { recursive: true })
        fs.writeFileSync(dumpPath, Buffer.from(dump))
        console.log(`migration: wrote dump to ${dumpPath} (${dump.byteLength} bytes)`)
        settle("migrated")
      } catch (error) {
        console.error("migration: failed to write dump file:", error)
        settle("fresh-install")
      }
    })

    migrationWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "migration-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    })

    migrationWindow.once("closed", () => {
      migrationWindow = null
    })

    // load the migration renderer page
    if (MIGRATION_WINDOW_VITE_DEV_SERVER_URL) {
      migrationWindow.loadURL(`${MIGRATION_WINDOW_VITE_DEV_SERVER_URL}/migration.html`)
    } else {
      migrationWindow.loadFile(
        path.join(__dirname, `../renderer/${MIGRATION_WINDOW_VITE_NAME}/migration.html`),
      )
    }
  })
}
