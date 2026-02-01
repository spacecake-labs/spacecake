import { Context, Effect, Layer } from "effect"

/**
 * Service for writing data to a terminal PTY via IPC.
 * This is the renderer-side abstraction for terminal writes.
 */
export class TerminalWriter extends Context.Tag("TerminalWriter")<
  TerminalWriter,
  {
    readonly write: (id: string, data: string) => Effect.Effect<void>
  }
>() {}

/**
 * Live implementation that uses the Electron IPC bridge.
 */
export const TerminalWriterLive = Layer.succeed(TerminalWriter, {
  write: (id, data) => Effect.sync(() => window.electronAPI.writeTerminal(id, data)),
})
