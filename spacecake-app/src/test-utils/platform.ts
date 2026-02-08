import net from "node:net"

export const isWindows = process.platform === "win32"

/**
 * Wait for an IPC server to be listening (works with both Unix sockets and Windows named pipes).
 * Unlike checking fs.existsSync(), this actually verifies the server is ready to accept connections.
 */
export async function waitForServer(ipcPath: string, maxAttempts = 40): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const connected = await tryConnect(ipcPath)
    if (connected) return
    await sleep(50)
  }
  throw new Error(`Server not listening at ${ipcPath}`)
}

function tryConnect(ipcPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection(ipcPath, () => {
      client.end()
      resolve(true)
    })
    client.on("error", () => resolve(false))
    client.setTimeout(100, () => {
      client.destroy()
      resolve(false)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Normalize line endings to LF for cross-platform string comparisons.
 * Git on Windows may convert \n to \r\n in text fixtures.
 */
export const normalizeLineEndings = (s: string): string => s.replace(/\r\n/g, "\n")
