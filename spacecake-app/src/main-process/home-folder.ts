import fs from "node:fs"
import path from "node:path"

import { GETTING_STARTED_CONTENT } from "@/guides/getting-started"
import { app } from "electron"

/** Base spacecake directory (e.g., ~/.spacecake or $SPACECAKE_HOME) */
export function getHomeFolderPath(): string {
  // Allow override via env var (used for e2e test isolation)
  if (process.env.SPACECAKE_HOME) {
    return process.env.SPACECAKE_HOME
  }
  return path.join(app.getPath("home"), ".spacecake")
}

/** App-managed directory (e.g., ~/.spacecake/.app) */
export function getAppDir(): string {
  return path.join(getHomeFolderPath(), ".app")
}

/** Hooks directory (e.g., ~/.spacecake/.app/hooks) */
export function getHooksDir(): string {
  return path.join(getAppDir(), "hooks")
}

export function ensureHomeFolderExists(): void {
  const appPath = getAppDir()
  const guidePath = path.join(appPath, "getting-started.md")

  // ensure .app folder exists
  fs.mkdirSync(appPath, { recursive: true })

  // always write latest guide content (we own .app/)
  fs.writeFileSync(guidePath, GETTING_STARTED_CONTENT, "utf-8")
}
