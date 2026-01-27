import fs from "node:fs"
import path from "node:path"

import { GETTING_STARTED_CONTENT } from "@/guides/getting-started"
import { FileMode } from "@/services/file-system"
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

/** Statusline hook script that sends data to spacecake via unix socket */
const STATUSLINE_SCRIPT = `#!/usr/bin/env bash
# Sends Claude Code statusline data to spacecake (no output)
configDir="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
socketPath="\${configDir}/spacecake.sock"

input=$(cat)

if [ -S "$socketPath" ]; then
  echo "$input" | curl -s -X POST -H "Content-Type: application/json" -d @- \\
    --unix-socket "$socketPath" --max-time 2 \\
    http://localhost/statusline >/dev/null 2>&1 &
fi
exit 0
`

/** Returns the path to the statusline hook script */
export function getStatuslineScriptPath(): string {
  return path.join(getHooksDir(), "statusline.sh")
}

export function ensureHomeFolderExists(): void {
  const appPath = getAppDir()
  const hooksPath = getHooksDir()
  const guidePath = path.join(appPath, "getting-started.md")
  const statuslineScriptPath = getStatuslineScriptPath()

  // ensure .app and hooks folders exist
  fs.mkdirSync(hooksPath, { recursive: true })

  // always write latest guide content (we own .app/)
  fs.writeFileSync(guidePath, GETTING_STARTED_CONTENT, "utf-8")

  // always write latest statusline hook script (we own .app/hooks/)
  fs.writeFileSync(statuslineScriptPath, STATUSLINE_SCRIPT, {
    encoding: "utf-8",
    mode: FileMode.EXECUTABLE,
  })
}
