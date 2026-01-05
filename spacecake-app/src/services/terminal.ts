import defaultShell from "@/main-process/default-shell"
import { Effect } from "effect"
import { BrowserWindow } from "electron"

import { TerminalError } from "@/types/terminal"

type PtyModule = typeof import("@lydell/node-pty")
type IPty = Awaited<ReturnType<PtyModule["spawn"]>>

let ptyModule: PtyModule | null = null
let ptyLoadError: Error | null = null

const loadPtyModule = async (): Promise<PtyModule> => {
  if (ptyModule) return ptyModule
  if (ptyLoadError) throw ptyLoadError

  try {
    ptyModule = await import("@lydell/node-pty")
    return ptyModule
  } catch (error) {
    ptyLoadError = error instanceof Error ? error : new Error(String(error))
    throw ptyLoadError
  }
}

export class Terminal extends Effect.Service<Terminal>()("app/Terminal", {
  effect: Effect.gen(function* () {
    yield* Effect.void
    const terminals = new Map<string, IPty>()

    const create = (
      id: string,
      cols: number,
      rows: number,
      cwd: string = process.env.HOME || process.env.USERPROFILE || ""
    ) =>
      Effect.tryPromise({
        try: async () => {
          const pty = await loadPtyModule()

          // If terminal already exists, kill it first (or just return?)
          // For now, let's kill existing if any to avoid leaks on reload
          if (terminals.has(id)) {
            terminals.get(id)?.kill()
            terminals.delete(id)
          }

          const ptyProcess = pty.spawn(process.env.SHELL || defaultShell, [], {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env: process.env as Record<string, string>,
          })
          ptyProcess.onData((data) => {
            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send("terminal:output", { id, data })
            })
          })

          terminals.set(id, ptyProcess)
        },
        catch: (error) =>
          new TerminalError({
            message: `failed to create terminal: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

    const resize = (id: string, cols: number, rows: number) =>
      Effect.try({
        try: () => {
          const term = terminals.get(id)
          if (term) term.resize(cols, rows)
        },
        catch: (error) =>
          new TerminalError({ message: `failed to resize terminal: ${error}` }),
      })

    const write = (id: string, data: string) =>
      Effect.try({
        try: () => {
          const term = terminals.get(id)
          if (term) term.write(data)
        },
        catch: (error) =>
          new TerminalError({
            message: `failed to write to terminal: ${error}`,
          }),
      })

    const kill = (id: string) =>
      Effect.try({
        try: () => {
          const term = terminals.get(id)
          if (term) {
            term.kill()
            terminals.delete(id)
          }
        },
        catch: (error) =>
          new TerminalError({ message: `failed to kill terminal: ${error}` }),
      })

    return { create, resize, write, kill }
  }),
}) {}
