import * as pty from "@lydell/node-pty"
import { Effect } from "effect"
import { BrowserWindow } from "electron"

import { TerminalError } from "@/types/terminal"

export class Terminal extends Effect.Service<Terminal>()("app/Terminal", {
  effect: Effect.gen(function* () {
    yield* Effect.void
    const terminals = new Map<string, pty.IPty>()

    const create = (
      id: string,
      cols: number,
      rows: number,
      cwd: string = process.env.HOME || ""
    ) =>
      Effect.try({
        try: () => {
          // If terminal already exists, kill it first (or just return?)
          // For now, let's kill existing if any to avoid leaks on reload
          if (terminals.has(id)) {
            terminals.get(id)?.kill()
            terminals.delete(id)
          }

          const shell =
            process.env.SHELL ||
            (process.platform === "win32" ? "powershell.exe" : "bash")

          const ptyProcess = pty.spawn(shell, [], {
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
          new TerminalError({ message: `Failed to create terminal: ${error}` }),
      })

    const resize = (id: string, cols: number, rows: number) =>
      Effect.try({
        try: () => {
          const term = terminals.get(id)
          if (term) term.resize(cols, rows)
        },
        catch: (error) =>
          new TerminalError({ message: `Failed to resize terminal: ${error}` }),
      })

    const write = (id: string, data: string) =>
      Effect.try({
        try: () => {
          const term = terminals.get(id)
          if (term) term.write(data)
        },
        catch: (error) =>
          new TerminalError({
            message: `Failed to write to terminal: ${error}`,
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
          new TerminalError({ message: `Failed to kill terminal: ${error}` }),
      })

    return { create, resize, write, kill }
  }),
}) {}
