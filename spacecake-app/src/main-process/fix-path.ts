import process from "node:process"
import { shellPath } from "shell-path"
import stripAnsi from "strip-ansi"

export async function fixPath() {
  if (process.platform === "win32") {
    return
  }

  try {
    const pathEnv = await shellPath()

    process.env.PATH =
      (pathEnv ? stripAnsi(pathEnv) : undefined) ||
      ["./node_modules/.bin", "/.nodebrew/current/bin", "/usr/local/bin", process.env.PATH].join(
        ":",
      )
  } catch (e) {
    console.error("failed to fix path:", e)
  }
}
