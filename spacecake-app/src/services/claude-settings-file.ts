import { ClaudeConfig } from "@/services/claude-config"
import {
  FileSystem,
  UnknownFSError,
  type FileSystemError,
} from "@/services/file-system"
import { SpacecakeHome } from "@/services/spacecake-home"
import { Effect, Layer } from "effect"

import { AbsolutePath } from "@/types/workspace"

/**
 * Shape of ~/.claude/settings.json
 * We only define the fields we care about; other fields are preserved.
 */
export interface ClaudeSettings {
  /** StatusLine hook configuration */
  statusLine?: StatusLineSettings | null
  /** Allow other fields to pass through */
  [key: string]: unknown
}

export interface StatusLineSettings {
  /** Type of statusline hook – must be "command" */
  type: "command"
  /** Path to the statusline hook command */
  command?: string
}

/**
 * Result of checking the current statusline configuration
 */
export interface StatuslineConfigStatus {
  /** Whether statusLine is configured at all */
  configured: boolean
  /** Whether the configured command points to our spacecake script */
  isSpacecake: boolean
  /** Old inline `bash -c '…spacecake.sock…'` config from pre-auto-setup versions */
  isInlineSpacecake: boolean
  /** The current command, if any */
  command?: string
}

/**
 * The core service effect, separated so tests can provide custom dependencies.
 */
const makeClaudeSettingsFile = Effect.gen(function* () {
  const config = yield* ClaudeConfig
  const fs = yield* FileSystem
  const home = yield* SpacecakeHome

  const settingsPath = AbsolutePath(config.settingsPath)

  /**
   * Parse JSON content, returning empty settings on parse failure
   */
  const parseJson = (
    content: string
  ): Effect.Effect<ClaudeSettings, FileSystemError> =>
    Effect.try({
      try: () => JSON.parse(content) as ClaudeSettings,
      catch: () =>
        new UnknownFSError({
          path: settingsPath,
          description: "invalid JSON in settings file",
        }),
    }).pipe(
      // Treat parse errors as empty settings (file exists but is malformed)
      Effect.catchAll(() => Effect.succeed({}))
    )

  /**
   * Read settings.json, returns null if the file doesn't exist
   */
  const read = (): Effect.Effect<ClaudeSettings | null, FileSystemError> =>
    fs.readTextFile(settingsPath).pipe(
      Effect.flatMap((content) => parseJson(content.content)),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    )

  /**
   * Write settings.json (full replacement)
   */
  const write = (
    settings: ClaudeSettings
  ): Effect.Effect<void, FileSystemError> =>
    fs.writeTextFile(settingsPath, JSON.stringify(settings, null, 2))

  /**
   * Update only the statusLine field, preserving other settings.
   * Pass null to remove the statusLine configuration.
   */
  const updateStatusline = (
    statusLine: StatusLineSettings | null
  ): Effect.Effect<void, FileSystemError> =>
    read().pipe(
      Effect.map((existing) => ({
        ...(existing ?? {}),
        statusLine,
      })),
      Effect.flatMap(write)
    )

  /**
   * Configure statusline to use the spacecake hook script
   */
  const configureForSpacecake = (): Effect.Effect<void, FileSystemError> =>
    updateStatusline({ type: "command", command: home.statuslineScriptPath })

  /**
   * Get the current statusline configuration status
   */
  const getStatuslineStatus = (): Effect.Effect<
    StatuslineConfigStatus,
    FileSystemError
  > =>
    read().pipe(
      Effect.map((settings) => {
        const spacecakePath = home.statuslineScriptPath

        if (!settings?.statusLine) {
          return {
            configured: false,
            isSpacecake: false,
            isInlineSpacecake: false,
          }
        }

        const command = settings.statusLine.command
        return {
          configured: !!command,
          isSpacecake: command === spacecakePath,
          // Detects the old inline `bash -c '…spacecake.sock…'` config
          // that users copy-pasted before auto-setup existed
          isInlineSpacecake:
            !!command &&
            command !== spacecakePath &&
            command.includes("spacecake.sock"),
          command,
        }
      })
    )

  return {
    read,
    write,
    updateStatusline,
    configureForSpacecake,
    getStatuslineStatus,
  } as const
})

/**
 * Service for reading and writing Claude's settings.json file.
 *
 * Handles the ~/.claude/settings.json file which stores Claude Code configuration
 * including the statusLine hook settings.
 */
export class ClaudeSettingsFile extends Effect.Service<ClaudeSettingsFile>()(
  "ClaudeSettingsFile",
  {
    effect: makeClaudeSettingsFile,
    dependencies: [ClaudeConfig.Default, FileSystem.Default],
  }
) {}

/**
 * Test layer for ClaudeSettingsFile that uses custom dependencies
 * instead of the defaults baked into ClaudeSettingsFile.Default.
 */
export const makeClaudeSettingsFileTestLayer = (
  claudeConfigLayer: Layer.Layer<ClaudeConfig>,
  fileSystemLayer: Layer.Layer<FileSystem>,
  spacecakeHomeLayer: Layer.Layer<SpacecakeHome>
) =>
  Layer.effect(
    ClaudeSettingsFile,
    makeClaudeSettingsFile as unknown as Effect.Effect<
      ClaudeSettingsFile,
      never,
      ClaudeConfig | FileSystem | SpacecakeHome
    >
  ).pipe(
    Layer.provide(claudeConfigLayer),
    Layer.provide(fileSystemLayer),
    Layer.provide(spacecakeHomeLayer)
  )
