import fs from "node:fs"
import path from "node:path"

import { GETTING_STARTED_CONTENT } from "@/guides/getting-started"
import { Context, Effect, Layer } from "effect"

/** rwxr-xr-x - executable scripts (mirrored from file-system.ts to avoid circular dep) */
const EXECUTABLE_MODE = 0o755

// ---------------------------------------------------------------------------
// AppEnv — captures Electron-specific values so the rest is pure
// ---------------------------------------------------------------------------

export interface AppEnv {
  readonly isPackaged: boolean
  readonly homePath: string
  readonly resourcesPath: string
  readonly cliSourceEntryPath: string
  readonly globalBinTarget: string
}

export class AppEnvTag extends Context.Tag("AppEnv")<AppEnvTag, AppEnv>() {}

/**
 * Live layer — the only place that imports `electron`.
 */
export const AppEnvLive: Layer.Layer<AppEnvTag> = Layer.sync(AppEnvTag, () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to avoid importing electron in tests
  const { app } = require("electron")
  return {
    isPackaged: app.isPackaged,
    homePath: app.getPath("home"),
    resourcesPath: process.resourcesPath ?? "",
    cliSourceEntryPath: app.isPackaged
      ? ""
      : path.resolve(__dirname, "../../../cli/src/main.ts"),
    globalBinTarget: "/usr/local/bin/spacecake",
  }
})

// ---------------------------------------------------------------------------
// Statusline hook script content
// ---------------------------------------------------------------------------

const STATUSLINE_SCRIPT = `#!/usr/bin/env bash
# Sends Claude Code statusline data to spacecake (no output)
configDir="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
socketPath="\${configDir}/spacecake.sock"

input=$(cat)

if [ -S "$socketPath" ]; then
  echo "$input" | curl -s -X POST -H "Content-Type: application/json" -d @- \\
    --unix-socket "$socketPath" --max-time 2 \\
    http://localhost/statusline >/dev/null 2>&1 &
fi
exit 0
`

// ---------------------------------------------------------------------------
// SpacecakeHome — pure data service computed from AppEnv
// ---------------------------------------------------------------------------

/**
 * Core service effect — separated so tests can provide a custom AppEnvTag.
 */
export const makeSpacecakeHome = Effect.gen(function* () {
  const env = yield* AppEnvTag

  const homeDir = process.env.SPACECAKE_HOME
    ? process.env.SPACECAKE_HOME
    : path.join(env.homePath, ".spacecake")

  const appDir = path.join(homeDir, ".app")
  const hooksDir = path.join(appDir, "hooks")
  const statuslineScriptPath = path.join(hooksDir, "statusline.sh")

  const cliBinDir = env.isPackaged
    ? path.join(env.resourcesPath, "bin")
    : path.join(appDir, "bin")

  const bundledCliBinaryPath = env.isPackaged
    ? path.join(env.resourcesPath, "bin", "spacecake")
    : null

  return {
    homeDir,
    appDir,
    hooksDir,
    statuslineScriptPath,
    cliBinDir,
    bundledCliBinaryPath,
    globalBinTarget: env.globalBinTarget,
    cliSourceEntryPath: env.cliSourceEntryPath,
    isPackaged: env.isPackaged,
  }
})

export class SpacecakeHome extends Effect.Service<SpacecakeHome>()(
  "SpacecakeHome",
  {
    effect: makeSpacecakeHome,
    dependencies: [AppEnvLive],
  }
) {}

// ---------------------------------------------------------------------------
// Test layer factory — mirrors makeClaudeConfigTestLayer
// ---------------------------------------------------------------------------

export const makeSpacecakeHomeTestLayer = (opts: {
  homeDir: string
  isPackaged?: boolean
  resourcesPath?: string
  cliSourceEntryPath?: string
  globalBinTarget?: string
}): Layer.Layer<SpacecakeHome> => {
  const isPackaged = opts.isPackaged ?? false
  const resourcesPath = opts.resourcesPath ?? ""
  const cliSourceEntryPath = opts.cliSourceEntryPath ?? ""
  const globalBinTarget = opts.globalBinTarget ?? "/usr/local/bin/spacecake"

  const appDir = path.join(opts.homeDir, ".app")
  const hooksDir = path.join(appDir, "hooks")

  return Layer.succeed(SpacecakeHome, {
    homeDir: opts.homeDir,
    appDir,
    hooksDir,
    statuslineScriptPath: path.join(hooksDir, "statusline.sh"),
    cliBinDir: isPackaged
      ? path.join(resourcesPath, "bin")
      : path.join(appDir, "bin"),
    bundledCliBinaryPath: isPackaged
      ? path.join(resourcesPath, "bin", "spacecake")
      : null,
    globalBinTarget,
    cliSourceEntryPath,
    isPackaged,
  } as SpacecakeHome)
}

// ---------------------------------------------------------------------------
// installCli — Effect requiring SpacecakeHome
// ---------------------------------------------------------------------------

export const installCli: Effect.Effect<void, never, SpacecakeHome> = Effect.gen(
  function* () {
    const home = yield* SpacecakeHome

    try {
      if (home.isPackaged) {
        const bundledPath = home.bundledCliBinaryPath
        if (!bundledPath || !fs.existsSync(bundledPath)) {
          console.warn("CLI binary not found in app bundle:", bundledPath)
          return
        }

        const symlinkTarget = home.globalBinTarget

        try {
          const stat = fs.lstatSync(symlinkTarget)

          if (stat.isSymbolicLink()) {
            const existingTarget = fs.readlinkSync(symlinkTarget)
            if (existingTarget === bundledPath) {
              return
            }
            fs.unlinkSync(symlinkTarget)
          } else {
            console.warn(
              `CLI install: ${symlinkTarget} exists and is not a symlink we created. Skipping.`
            )
            return
          }
        } catch {
          // File doesn't exist — proceed with creation
        }

        try {
          fs.symlinkSync(bundledPath, symlinkTarget)
          console.log(`CLI installed: ${symlinkTarget} -> ${bundledPath}`)
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code
          if (code === "EACCES") {
            console.warn(
              `CLI install: permission denied creating ${symlinkTarget}. ` +
                "The CLI will still be available inside spacecake terminals."
            )
          } else {
            console.warn("CLI install: failed to create symlink:", err)
          }
        }
      } else {
        // Dev mode — write a wrapper script
        const binDir = path.join(home.appDir, "bin")
        fs.mkdirSync(binDir, { recursive: true })

        const wrapper = `#!/usr/bin/env bash
# Auto-generated by spacecake (dev mode)
exec bun run "${home.cliSourceEntryPath}" "$@"
`
        const wrapperPath = path.join(binDir, "spacecake")
        fs.writeFileSync(wrapperPath, wrapper, {
          encoding: "utf-8",
          mode: EXECUTABLE_MODE,
        })

        console.log(`CLI dev wrapper installed: ${wrapperPath}`)
      }
    } catch (err) {
      console.warn("CLI install: unexpected error:", err)
    }
  }
)

// ---------------------------------------------------------------------------
// ensureHomeFolderExists — Effect requiring SpacecakeHome
// ---------------------------------------------------------------------------

export const ensureHomeFolderExists: Effect.Effect<void, never, SpacecakeHome> =
  Effect.gen(function* () {
    const home = yield* SpacecakeHome

    // ensure .app and hooks folders exist
    fs.mkdirSync(home.hooksDir, { recursive: true })

    // always write latest guide content (we own .app/)
    fs.writeFileSync(
      path.join(home.appDir, "getting-started.md"),
      GETTING_STARTED_CONTENT,
      "utf-8"
    )

    // always write latest statusline hook script (we own .app/hooks/)
    fs.writeFileSync(home.statuslineScriptPath, STATUSLINE_SCRIPT, {
      encoding: "utf-8",
      mode: EXECUTABLE_MODE,
    })

    // install CLI binary / wrapper
    yield* installCli
  })
