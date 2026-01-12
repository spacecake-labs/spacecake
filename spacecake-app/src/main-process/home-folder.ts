import fs from "node:fs"
import path from "node:path"

import { GETTING_STARTED_CONTENT } from "@/guides/getting-started"
import { app } from "electron"

export function getHomeFolderPath(): string {
  // Allow override via env var (used for e2e test isolation)
  if (process.env.SPACECAKE_HOME) {
    return process.env.SPACECAKE_HOME
  }
  return path.join(app.getPath("home"), ".spacecake")
}

export function ensureHomeFolderExists(): void {
  const homePath = getHomeFolderPath()
  const appPath = path.join(homePath, ".app")
  const guidePath = path.join(appPath, "getting-started.md")

  // ensure .app folder exists
  fs.mkdirSync(appPath, { recursive: true })

  // always write latest guide content (we own .app/)
  fs.writeFileSync(guidePath, GETTING_STARTED_CONTENT, "utf-8")
}
