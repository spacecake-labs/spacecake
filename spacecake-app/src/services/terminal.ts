import { Effect } from "effect"
import { BrowserWindow } from "electron"
import path from "node:path"

import defaultShell from "@/main-process/default-shell"
import { SpacecakeHome } from "@/services/spacecake-home"
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
    const home = yield* SpacecakeHome
    const terminals = new Map<string, IPty>()

    // Finalizer to kill all pty processes on shutdown
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        console.log(`Terminal service: cleaning up ${terminals.size} terminals...`)
        for (const [id, term] of terminals) {
          try {
            term.kill()
            console.log(`Terminal service: killed terminal ${id}`)
          } catch (e) {
            console.error(`Terminal service: failed to kill terminal ${id}`, e)
          }
        }
        terminals.clear()
      }),
    )

    const create = (
      id: string,
      cols: number,
      rows: number,
      cwd: string = process.env.HOME || process.env.USERPROFILE || "",
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

          const cliSocketPath = path.join(home.appDir, "cli.sock")
          const cliBinDir = home.cliBinDir
          const currentPath = process.env.PATH ?? ""
          // Prepend CLI bin dir so `spacecake` is available even if
          // /usr/local/bin symlink wasn't created (e.g. no permissions)
          const pathWithCli = currentPath.includes(cliBinDir)
            ? currentPath
            : `${cliBinDir}:${currentPath}`

          const env = {
            ...(process.env as Record<string, string>),
            PATH: pathWithCli,
            BASH_SILENCE_DEPRECATION_WARNING: "1",
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            // CLI integration — allows `spacecake open` to find the running instance
            SPACECAKE_IPC_HOOK: cliSocketPath,
            // Set EDITOR/VISUAL so tools (including Claude Code plan mode) open files in spacecake
            EDITOR: "spacecake open --wait",
            VISUAL: "spacecake open --wait",
            // Claude Code defaults to plan mode when run inside spacecake
            CLAUDE_CODE_ACTION: "plan",
          }

          const ptyProcess = pty.spawn(defaultShell, [], {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env,
          })
          ptyProcess.onData((data) => {
            let output = data

            // Filter Claude Code's "IDE disconnected" message - it shows briefly
            // during startup even when connection succeeds. Our status badge
            // shows the actual connection state.
            if (data.includes("IDE disconnected")) {
              output = data.replace(/◯\s*IDE disconnected\r?\n?/g, "")
              if (!output) return
            }

            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send("terminal:output", { id, data: output })
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
        catch: (error) => new TerminalError({ message: `failed to resize terminal: ${error}` }),
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

    // Wait for terminal process to exit using Effect.async for proper callback handling.
    // On Windows, directory handles aren't released until the process fully terminates.
    // See: https://github.com/microsoft/node-pty/issues/647
    const waitForExit = (term: IPty) =>
      Effect.async<void>((resume) => {
        // Register exit handler - returns a disposable for cleanup
        const disposable = term.onExit(() => {
          resume(Effect.void)
        })

        // Return cleanup effect for interruption/timeout
        return Effect.sync(() => {
          disposable.dispose()
        })
      })

    const kill = (id: string) =>
      Effect.gen(function* () {
        const term = terminals.get(id)
        if (!term) return

        // Remove from map immediately to prevent double-kill attempts
        terminals.delete(id)

        // Trigger the kill
        yield* Effect.sync(() => term.kill())

        // Wait for exit with timeout - if timeout occurs, proceed anyway
        yield* waitForExit(term).pipe(
          Effect.timeout("2 seconds"),
          Effect.catchAll(() => {
            console.warn(`Terminal ${id}: kill timeout reached, proceeding anyway`)
            return Effect.void
          }),
        )
      }).pipe(
        // Handle any defects (e.g., terminal already dead) gracefully
        Effect.catchAllDefect(() => Effect.void),
        Effect.mapError(
          (error) => new TerminalError({ message: `failed to kill terminal: ${error}` }),
        ),
      )

    return { create, resize, write, kill }
  }),
}) {}
