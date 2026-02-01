import { Config, Effect, Layer, Option } from "effect"
import os from "node:os"
import path from "node:path"

/**
 * Service that provides the Claude configuration directory path.
 *
 * Respects CLAUDE_CONFIG_DIR environment variable, otherwise defaults to ~/.claude
 */
export class ClaudeConfig extends Effect.Service<ClaudeConfig>()("ClaudeConfig", {
  effect: Effect.gen(function* () {
    const configDir = yield* Config.string("CLAUDE_CONFIG_DIR").pipe(
      Config.withDefault(path.join(os.homedir(), ".claude")),
    )

    const taskListId = yield* Config.option(Config.string("CLAUDE_CODE_TASK_LIST_ID"))

    return {
      /** Base Claude config directory (e.g., ~/.claude or $CLAUDE_CONFIG_DIR) */
      configDir,
      /** IDE integration directory (e.g., ~/.claude/ide) */
      ideDir: path.join(configDir, "ide"),
      /** Unix socket path for Claude hooks (e.g., ~/.claude/spacecake.sock) */
      socketPath: path.join(configDir, "spacecake.sock"),
      /** Base tasks directory (e.g., ~/.claude/tasks) */
      tasksDir: path.join(configDir, "tasks"),
      /** Claude settings file path (e.g., ~/.claude/settings.json) */
      settingsPath: path.join(configDir, "settings.json"),
      /** Optional task list ID from CLAUDE_CODE_TASK_LIST_ID env var */
      taskListId: taskListId as Option.Option<string>,
    }
  }),
}) {}

/**
 * Test layer that uses a custom config directory
 */
export const makeClaudeConfigTestLayer = (configDir: string) =>
  Layer.succeed(ClaudeConfig, {
    configDir,
    ideDir: path.join(configDir, "ide"),
    socketPath: path.join(configDir, "spacecake.sock"),
    tasksDir: path.join(configDir, "tasks"),
    settingsPath: path.join(configDir, "settings.json"),
    taskListId: Option.none(),
  } as ClaudeConfig)
