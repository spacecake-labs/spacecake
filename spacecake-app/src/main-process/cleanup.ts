import type { FSWatcher } from "chokidar"
import { app } from "electron"

// Type for watcher entries
export type WatchEntry = {
  watcher: FSWatcher
  targetIds: Set<number>
}

// Cleanup function to close all watchers
export function closeAllWatchers(watchers: Map<string, WatchEntry>) {
  for (const [workspacePath, entry] of watchers.entries()) {
    try {
      entry.watcher.close()
      console.log(`closed watcher for workspace: ${workspacePath}`)
    } catch (error) {
      console.error(`error closing watcher for ${workspacePath}:`, error)
    }
  }
  watchers.clear()
}

// Setup all exit handlers
export function setupExitHandlers(watchers: Map<string, WatchEntry>) {
  // Process exit handlers to ensure watchers are cleaned up
  process.on("exit", () => {
    closeAllWatchers(watchers)
  })

  process.on("SIGINT", () => {
    console.log("received SIGINT, closing watchers...")
    closeAllWatchers(watchers)
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    console.log("received SIGTERM, closing watchers...")
    closeAllWatchers(watchers)
    process.exit(0)
  })

  process.on("uncaughtException", (error) => {
    console.error("uncaught exception, closing watchers...", error)
    closeAllWatchers(watchers)
    process.exit(1)
  })

  process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection, closing watchers...", reason)
    closeAllWatchers(watchers)
    process.exit(1)
  })

  // Electron app lifecycle events
  app.on("before-quit", () => {
    console.log("app before-quit, closing watchers...")
    closeAllWatchers(watchers)
  })

  app.on("window-all-closed", () => {
    console.log("all windows closed, closing watchers...")
    closeAllWatchers(watchers)
  })

  app.on("quit", () => {
    console.log("app quit, closing watchers...")
    closeAllWatchers(watchers)
  })
}
