import os from "node:os"
import path from "node:path"

import { Config, Effect, Layer } from "effect"

/**
 * Service that provides the Claude configuration directory path.
 *
 * Respects CLAUDE_CONFIG_DIR environment variable, otherwise defaults to ~/.claude
 */
export class ClaudeConfig extends Effect.Service<ClaudeConfig>()(
  "ClaudeConfig",
  {
    effect: Effect.gen(function* () {
      const configDir = yield* Config.string("CLAUDE_CONFIG_DIR").pipe(
        Config.withDefault(path.join(os.homedir(), ".claude"))
      )

      return {
        /** Base Claude config directory (e.g., ~/.claude or $CLAUDE_CONFIG_DIR) */
        configDir,
        /** IDE integration directory (e.g., ~/.claude/ide) */
        ideDir: path.join(configDir, "ide"),
        /** Unix socket path for Claude hooks (e.g., ~/.claude/spacecake.sock) */
        socketPath: path.join(configDir, "spacecake.sock"),
      }
    }),
  }
) {}

/**
 * Test layer that uses a custom config directory
 */
export const makeClaudeConfigTestLayer = (configDir: string) =>
  Layer.succeed(ClaudeConfig, {
    configDir,
    ideDir: path.join(configDir, "ide"),
    socketPath: path.join(configDir, "spacecake.sock"),
  } as ClaudeConfig)
