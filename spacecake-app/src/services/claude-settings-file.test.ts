import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import fs from "node:fs"
import path from "node:path"
import { describe, expect } from "vitest"

import { WatcherService } from "@/main-process/watcher"
import { ClaudeConfig } from "@/services/claude-config"
import {
  ClaudeSettingsFile,
  makeClaudeSettingsFileTestLayer,
} from "@/services/claude-settings-file"
import { FileSystem } from "@/services/file-system"
import { GitIgnoreLive } from "@/services/git-ignore-parser"
import { makeSpacecakeHomeTestLayer } from "@/services/spacecake-home"

// Use path.join for cross-platform compatibility - on Windows paths use backslashes
const SPACECAKE_SCRIPT_PATH = path.join(
  "/test",
  ".spacecake",
  ".app",
  "hooks",
  process.platform === "win32" ? "statusline.cmd" : "statusline.sh",
)

// Mock WatcherService - we're not testing watcher functionality here
const MockWatcherService = Layer.succeed(WatcherService, {
  _tag: "app/WatcherService",
  startWorkspace: () => Effect.succeed(true),
  stopWorkspace: () => Effect.succeed(true),
  startFile: () => Effect.succeed(true),
  stopFile: () => Effect.succeed(true),
  startDir: () => Effect.succeed(true),
  stopDir: () => Effect.succeed(true),
} as WatcherService)

const SpacecakeHomeTestLayer = makeSpacecakeHomeTestLayer({
  homeDir: "/test/.spacecake",
})

// Create a test layer for ClaudeConfig that uses a temp directory
const makeTestClaudeConfigLayer = (configDir: string) =>
  Layer.succeed(ClaudeConfig, {
    configDir,
    ideDir: path.join(configDir, "ide"),
    socketPath: path.join(configDir, "spacecake.sock"),
    tasksDir: path.join(configDir, "tasks"),
    settingsPath: path.join(configDir, "settings.json"),
    taskListId: Option.none(),
  } as ClaudeConfig)

// FileSystem test layer with real filesystem
const FileSystemTestLayer = FileSystem.Default.pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(GitIgnoreLive),
  Layer.provide(MockWatcherService),
  Layer.provide(SpacecakeHomeTestLayer),
)

describe("ClaudeSettingsFile", () => {
  describe("read", () => {
    it.scoped("returns null when settings file does not exist", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.read()
        }).pipe(Effect.provide(testLayer))

        expect(result).toBeNull()
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns parsed settings when file exists with valid JSON", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        // Write a settings file
        const settings = {
          statusLine: { command: "/path/to/script.sh" },
          otherSetting: "value",
        }
        fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify(settings))

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.read()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual(settings)
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns empty object when file contains invalid JSON", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        // Write invalid JSON
        fs.writeFileSync(path.join(tempDir, "settings.json"), "{ invalid json }")

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.read()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({})
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns empty object when file is empty", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        // Write empty file
        fs.writeFileSync(path.join(tempDir, "settings.json"), "")

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.read()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({})
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  })

  describe("getStatuslineStatus", () => {
    it.scoped("returns not configured when file does not exist", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: false,
          isSpacecake: false,
          isInlineSpacecake: false,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns not configured when file exists but has no statusLine field", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        fs.writeFileSync(
          path.join(tempDir, "settings.json"),
          JSON.stringify({ otherSetting: "value" }),
        )

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: false,
          isSpacecake: false,
          isInlineSpacecake: false,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns not configured when statusLine exists but command is empty", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify({ statusLine: {} }))

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: false,
          isSpacecake: false,
          isInlineSpacecake: false,
          command: undefined,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns configured but not spacecake when command points elsewhere", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const otherCommand = "/other/path/to/script.sh"
        fs.writeFileSync(
          path.join(tempDir, "settings.json"),
          JSON.stringify({ statusLine: { command: otherCommand } }),
        )

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: true,
          isSpacecake: false,
          isInlineSpacecake: false,
          command: otherCommand,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns isInlineSpacecake for old inline bash -c config with spacecake.sock", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const inlineCommand =
          'bash -c \'socketPath="${HOME}/.claude/spacecake.sock"; [ -S "$socketPath" ] || exit 0; curl -s -X POST -H "Content-Type: application/json" -d @- --unix-socket "$socketPath" --max-time 2 http://localhost/statusline >/dev/null 2>&1; exit 0\''
        fs.writeFileSync(
          path.join(tempDir, "settings.json"),
          JSON.stringify({ statusLine: { command: inlineCommand } }),
        )

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: true,
          isSpacecake: false,
          isInlineSpacecake: true,
          command: inlineCommand,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("returns configured and isSpacecake when command points to spacecake script", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        fs.writeFileSync(
          path.join(tempDir, "settings.json"),
          JSON.stringify({ statusLine: { command: SPACECAKE_SCRIPT_PATH } }),
        )

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const result = yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          return yield* service.getStatuslineStatus()
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual({
          configured: true,
          isSpacecake: true,
          isInlineSpacecake: false,
          command: SPACECAKE_SCRIPT_PATH,
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  })

  describe("updateStatusline", () => {
    it.scoped("preserves existing settings when updating statusLine", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const existingSettings = {
          otherSetting: "value",
          anotherSetting: { nested: true },
        }
        fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify(existingSettings))

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.updateStatusline({
            type: "command",
            command: "/new/script.sh",
          })
        }).pipe(Effect.provide(testLayer))

        const written = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))
        expect(written).toEqual({
          ...existingSettings,
          statusLine: { type: "command", command: "/new/script.sh" },
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("creates settings file with statusLine when file does not exist", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.updateStatusline({
            type: "command",
            command: "/new/script.sh",
          })
        }).pipe(Effect.provide(testLayer))

        const written = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))
        expect(written).toEqual({
          statusLine: { type: "command", command: "/new/script.sh" },
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("removes statusLine when passed null", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const existingSettings = {
          statusLine: { command: "/old/script.sh" },
          otherSetting: "value",
        }
        fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify(existingSettings))

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.updateStatusline(null)
        }).pipe(Effect.provide(testLayer))

        const written = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))
        expect(written).toEqual({
          statusLine: null,
          otherSetting: "value",
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  })

  describe("configureForSpacecake", () => {
    it.scoped("sets statusLine command to spacecake script path", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.configureForSpacecake()
        }).pipe(Effect.provide(testLayer))

        const written = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))
        expect(written).toEqual({
          statusLine: { type: "command", command: SPACECAKE_SCRIPT_PATH },
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("overwrites existing statusLine configuration", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        fs.writeFileSync(
          path.join(tempDir, "settings.json"),
          JSON.stringify({
            statusLine: { command: "/other/script.sh" },
            preserved: "setting",
          }),
        )

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.configureForSpacecake()
        }).pipe(Effect.provide(testLayer))

        const written = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))
        expect(written).toEqual({
          statusLine: { type: "command", command: SPACECAKE_SCRIPT_PATH },
          preserved: "setting",
        })
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  })

  describe("write", () => {
    it.scoped("writes settings to the correct path", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        const newSettings = { customKey: "customValue" }

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.write(newSettings)
        }).pipe(Effect.provide(testLayer))

        const settingsPath = path.join(tempDir, "settings.json")
        expect(fs.existsSync(settingsPath)).toBe(true)

        const written = JSON.parse(fs.readFileSync(settingsPath, "utf8"))
        expect(written).toEqual(newSettings)
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    it.scoped("formats JSON with 2-space indentation", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const tempDir = yield* effectFs.makeTempDirectoryScoped()

        const testLayer = makeClaudeSettingsFileTestLayer(
          makeTestClaudeConfigLayer(tempDir),
          FileSystemTestLayer,
          SpacecakeHomeTestLayer,
        )

        yield* Effect.gen(function* () {
          const service = yield* ClaudeSettingsFile
          yield* service.write({ key: "value" })
        }).pipe(Effect.provide(testLayer))

        const content = fs.readFileSync(path.join(tempDir, "settings.json"), "utf8")
        // Check that it's formatted with 2-space indentation
        expect(content).toBe('{\n  "key": "value"\n}')
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  })
})
