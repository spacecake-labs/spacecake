#!/usr/bin/env node
/**
 * spacecake CLI
 *
 * Usage:
 *   spacecake open [--wait/-w] [--line/-l N] [--column/-c N] <files...>
 *
 * Communicates with a running spacecake instance via a Unix domain socket
 * at ~/.spacecake/.app/cli.sock (or $SPACECAKE_IPC_HOOK).
 */
import os from "node:os"
import path from "node:path"

import { Args, Command, Options } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Option } from "effect"

import { OpenRequestFailed, postOpen } from "./open.js"

// ---------------------------------------------------------------------------
// Socket path resolution
// ---------------------------------------------------------------------------

function getSocketPath(): string {
  if (process.env.SPACECAKE_IPC_HOOK) {
    return process.env.SPACECAKE_IPC_HOOK
  }
  const home =
    process.env.SPACECAKE_HOME ?? path.join(os.homedir(), ".spacecake")
  return path.join(home, ".app", "cli.sock")
}

// ---------------------------------------------------------------------------
// Args & Options
// ---------------------------------------------------------------------------

const files = Args.path({ name: "files" }).pipe(Args.atLeast(1))
const wait = Options.boolean("wait").pipe(Options.withAlias("w"))
const line = Options.integer("line").pipe(
  Options.withAlias("l"),
  Options.optional
)
const column = Options.integer("column").pipe(
  Options.withAlias("c"),
  Options.optional
)

// ---------------------------------------------------------------------------
// Open subcommand
// ---------------------------------------------------------------------------

const open = Command.make("open", { files, wait, line, column }, (config) =>
  Effect.gen(function* () {
    const socketPath = getSocketPath()
    const resolvedFiles = config.files.map((f) => ({
      path: path.resolve(f),
      line: Option.getOrUndefined(config.line),
      col: Option.getOrUndefined(config.column),
    }))

    const response = yield* postOpen(socketPath, {
      files: resolvedFiles,
      wait: config.wait,
    }).pipe(Effect.tapError((err) => Console.error(err.message)))

    if (response.status !== 200) {
      const body = yield* Effect.try({
        try: () => JSON.parse(response.body) as { error?: string },
        catch: () =>
          new OpenRequestFailed({ message: "Invalid response from server" }),
      })
      yield* Console.error(`Error: ${body.error ?? "Unknown error"}`)
      yield* Effect.fail(
        new OpenRequestFailed({
          message: body.error ?? "Unknown error",
        })
      )
    }
  })
)

// ---------------------------------------------------------------------------
// Top-level command
// ---------------------------------------------------------------------------

const spacecake = Command.make("spacecake", {}).pipe(
  Command.withSubcommands([open])
)

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const cli = Command.run(spacecake, {
  name: "spacecake",
  version: "0.1.0",
})

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
