import path from "node:path"

import * as Effect from "effect/Effect"
import { BrowserWindow, webContents } from "electron"

import { buildPathWithCli } from "@/lib/utils"
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

// ~100KB max per terminal output buffer
const MAX_BUFFER_SIZE = 100_000

export interface TabInfo {
  id: string
  surfaceId: string
  label: string
  cwdPath: string
}

export interface TabState {
  tabs: TabInfo[]
  activeId: string | null
}

interface TerminalEntry {
  pty: IPty
  surfaceId?: string
  webContentsId?: number
  outputBuffer: string[]
  outputBufferSize: number
  ideDisconnectedSent: boolean
}

export class Terminal extends Effect.Service<Terminal>()("app/Terminal", {
  scoped: Effect.gen(function* () {
    const home = yield* SpacecakeHome
    const terminals = new Map<string, TerminalEntry>()
    const tabStates = new Map<string, TabState>()

    // Finalizer to kill all pty processes on shutdown
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        console.log(`Terminal service: cleaning up ${terminals.size} terminals...`)
        for (const [id, entry] of terminals) {
          try {
            entry.pty.kill()
            console.log(`Terminal service: killed terminal ${id}`)
          } catch (e) {
            console.error(`Terminal service: failed to kill terminal ${id}`, e)
          }
        }
        terminals.clear()
        tabStates.clear()
      }),
    )

    const create = (
      id: string,
      cols: number,
      rows: number,
      cwd: string = process.env.HOME || process.env.USERPROFILE || "",
      surfaceId?: string,
      webContentsId?: number,
    ) =>
      Effect.tryPromise({
        try: async () => {
          const pty = await loadPtyModule()

          // if terminal already exists, kill it first to avoid leaks on reload
          const existing = terminals.get(id)
          if (existing) {
            existing.pty.kill()
            terminals.delete(id)
          }

          const cliSocketPath = path.join(home.appDir, "cli.sock")
          const cliBinDir = home.cliBinDir
          const currentPath = process.env.PATH ?? ""
          // prepend cli bin dir so `spacecake` is available even if
          // /usr/local/bin symlink wasn't created (e.g. no permissions)
          const pathWithCli = buildPathWithCli(cliBinDir, currentPath, path.delimiter)

          const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
            PATH: pathWithCli,
            BASH_SILENCE_DEPRECATION_WARNING: "1",
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            // CLI integration - allows `spacecake open` to find the running instance
            SPACECAKE_IPC_HOOK: cliSocketPath,
            // Set EDITOR/VISUAL so tools open files in spacecake
            EDITOR: "spacecake open --wait",
            VISUAL: "spacecake open --wait",
            // Marks this terminal as owned by spacecake - the statusline hook
            // script uses this to decide whether to POST to the socket
            SPACECAKE_TERMINAL: "1",
          }

          // correlates statusline POSTs back to this terminal tab
          if (surfaceId) {
            env.SPACECAKE_SURFACE_ID = surfaceId
          }

          const entry: TerminalEntry = {
            pty: null!,
            surfaceId,
            webContentsId,
            outputBuffer: [],
            outputBufferSize: 0,
            ideDisconnectedSent: false,
          }

          const ptyProcess = pty.spawn(defaultShell, [], {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env,
          })
          entry.pty = ptyProcess

          ptyProcess.onData((data) => {
            // buffer output for replay on reconnect
            entry.outputBuffer.push(data)
            entry.outputBufferSize += data.length

            // compact when over cap: join + slice instead of O(n) shifts
            if (entry.outputBufferSize > MAX_BUFFER_SIZE && entry.outputBuffer.length > 1) {
              const trimmed = entry.outputBuffer.join("").slice(-MAX_BUFFER_SIZE)
              entry.outputBuffer.length = 0
              entry.outputBuffer.push(trimmed)
              entry.outputBufferSize = trimmed.length
            }

            if (data.includes("IDE disconnected") && !entry.ideDisconnectedSent) {
              entry.ideDisconnectedSent = true
              BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send("terminal:ide-disconnected")
              })
            }

            // send output to the owning window only; fallback to broadcast if gone
            const owner =
              entry.webContentsId != null ? webContents.fromId(entry.webContentsId) : null
            if (owner && !owner.isDestroyed()) {
              owner.send("terminal:output", { id, data })
            } else {
              BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send("terminal:output", { id, data })
              })
            }
          })

          terminals.set(id, entry)
        },
        catch: (error) =>
          new TerminalError({
            message: `failed to create terminal: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

    const resize = (id: string, cols: number, rows: number) =>
      Effect.try({
        try: () => {
          const entry = terminals.get(id)
          if (entry) entry.pty.resize(cols, rows)
        },
        catch: (error) => new TerminalError({ message: `failed to resize terminal: ${error}` }),
      })

    const write = (id: string, data: string) =>
      Effect.try({
        try: () => {
          const entry = terminals.get(id)
          if (entry) entry.pty.write(data)
        },
        catch: (error) =>
          new TerminalError({
            message: `failed to write to terminal: ${error}`,
          }),
      })

    // Wait for terminal process to exit using Effect.async for proper callback handling.
    // On Windows, directory handles aren't released until the process fully terminates.
    // See: https://github.com/microsoft/node-pty/issues/647
    const waitForExit = (pty: IPty) =>
      Effect.async<void>((resume) => {
        const disposable = pty.onExit(() => {
          resume(Effect.void)
        })

        return Effect.sync(() => {
          disposable.dispose()
        })
      })

    const kill = (id: string) =>
      Effect.gen(function* () {
        const entry = terminals.get(id)
        if (!entry) return

        // remove from map immediately to prevent double-kill attempts
        terminals.delete(id)

        yield* Effect.sync(() => entry.pty.kill())

        // wait for exit with timeout — if timeout occurs, proceed anyway
        yield* waitForExit(entry.pty).pipe(
          Effect.timeout("2 seconds"),
          Effect.catchAll(() => {
            console.warn(`Terminal ${id}: kill timeout reached, proceeding anyway`)
            return Effect.void
          }),
        )
      }).pipe(
        Effect.catchAllDefect((defect) => {
          console.error(`Terminal ${id}: unexpected defect during kill`, defect)
          return Effect.void
        }),
        Effect.mapError(
          (error) => new TerminalError({ message: `failed to kill terminal: ${error}` }),
        ),
      )

    const list = () =>
      Effect.sync(() =>
        Array.from(terminals.entries()).map(([id, entry]) => ({
          id,
          surfaceId: entry.surfaceId ?? "",
        })),
      )

    const getBuffer = (id: string) =>
      Effect.sync(() => {
        const entry = terminals.get(id)
        return entry ? entry.outputBuffer.join("") : ""
      })

    const setTabState = (workspaceId: string, state: TabState) =>
      Effect.sync(() => {
        tabStates.set(workspaceId, state)
      })

    const getTabState = (workspaceId: string) =>
      Effect.sync(() => tabStates.get(workspaceId) ?? null)

    const has = (id: string) => Effect.sync(() => terminals.has(id))

    return { create, resize, write, kill, list, getBuffer, setTabState, getTabState, has } as const
  }),
}) {}
