import { userInfo } from "node:os"
import process from "node:process"

export const detectDefaultShell = () => {
  const { env } = process

  if (process.platform === "win32") {
    return env.COMSPEC || "cmd.exe"
  }

  try {
    const { shell } = userInfo()
    if (shell) {
      return shell
    }
  } catch {
    // ignore errors from userInfo
  }

  if (process.platform === "darwin") {
    return env.SHELL || "/bin/zsh"
  }

  return env.SHELL || "/bin/sh"
}

// Stores default shell when imported.
const defaultShell = detectDefaultShell()

export default defaultShell
