import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import path from "node:path"
import { describe, expect } from "vitest"

import { normalizePath } from "@/lib/utils"
import {
  AppEnvTag,
  ensureHomeFolderExists,
  installCli,
  makeSpacecakeHome,
  makeSpacecakeHomeTestLayer,
  SpacecakeHome,
  type AppEnv,
} from "@/services/spacecake-home"
import { isWindows } from "@/test-utils/platform"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a SpacecakeHome layer from an AppEnv (uses the real service effect, no electron). */
const makeLayerFromEnv = (env: AppEnv) =>
  Layer.effect(
    SpacecakeHome,
    makeSpacecakeHome as unknown as Effect.Effect<SpacecakeHome, never, AppEnvTag>,
  ).pipe(Layer.provide(Layer.succeed(AppEnvTag, env)))

// ---------------------------------------------------------------------------
// Path computation tests
// ---------------------------------------------------------------------------

describe("SpacecakeHome — path computation", () => {
  it.scoped("homeDir defaults to homePath/.spacecake", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()

      const layer = makeLayerFromEnv({
        isPackaged: false,
        homePath: tempDir,
        resourcesPath: "",
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      // homeDir is normalized to forward slashes for cross-platform consistency
      expect(home.homeDir).toBe(normalizePath(path.join(tempDir, ".spacecake")))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("homeDir respects SPACECAKE_HOME env override", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const customHome = path.join(tempDir, "custom-home")

      const prev = process.env.SPACECAKE_HOME
      process.env.SPACECAKE_HOME = customHome

      try {
        const layer = makeLayerFromEnv({
          isPackaged: false,
          homePath: "/should-be-ignored",
          resourcesPath: "",
          cliSourceEntryPath: "",
          globalBinTarget: "/usr/local/bin/spacecake",
        })

        const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
        // homeDir is normalized to forward slashes for cross-platform consistency
        expect(home.homeDir).toBe(normalizePath(customHome))
      } finally {
        if (prev === undefined) {
          delete process.env.SPACECAKE_HOME
        } else {
          process.env.SPACECAKE_HOME = prev
        }
      }
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("appDir is homeDir/.app", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()

      const layer = makeLayerFromEnv({
        isPackaged: false,
        homePath: tempDir,
        resourcesPath: "",
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      expect(home.appDir).toBe(path.join(tempDir, ".spacecake", ".app"))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("cliBinDir is resourcesPath/bin when packaged", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const resPath = path.join(tempDir, "Resources")

      const layer = makeLayerFromEnv({
        isPackaged: true,
        homePath: tempDir,
        resourcesPath: resPath,
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      expect(home.cliBinDir).toBe(path.join(resPath, "bin"))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("cliBinDir is appDir/bin when not packaged", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()

      const layer = makeLayerFromEnv({
        isPackaged: false,
        homePath: tempDir,
        resourcesPath: "",
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      expect(home.cliBinDir).toBe(path.join(tempDir, ".spacecake", ".app", "bin"))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("bundledCliBinaryPath is null when not packaged", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()

      const layer = makeLayerFromEnv({
        isPackaged: false,
        homePath: tempDir,
        resourcesPath: "",
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      expect(home.bundledCliBinaryPath).toBeNull()
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("bundledCliBinaryPath is resourcesPath/bin/spacecake when packaged", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const resPath = path.join(tempDir, "Resources")

      const layer = makeLayerFromEnv({
        isPackaged: true,
        homePath: tempDir,
        resourcesPath: resPath,
        cliSourceEntryPath: "",
        globalBinTarget: "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      expect(home.bundledCliBinaryPath).toBe(path.join(resPath, "bin", "spacecake"))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("statuslineScriptPath has correct platform extension", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()

      const layer = makeLayerFromEnv({
        isPackaged: false,
        homePath: tempDir,
        resourcesPath: "",
        cliSourceEntryPath: "",
        globalBinTarget: isWindows ? "" : "/usr/local/bin/spacecake",
      })

      const home = yield* SpacecakeHome.pipe(Effect.provide(layer))
      const expectedExt = isWindows ? "statusline.cmd" : "statusline.sh"
      expect(home.statuslineScriptPath).toBe(
        path.join(tempDir, ".spacecake", ".app", "hooks", expectedExt),
      )
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})

// ---------------------------------------------------------------------------
// ensureHomeFolderExists tests
// ---------------------------------------------------------------------------

describe("ensureHomeFolderExists", () => {
  it.scoped("creates .app and hooks directories", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        cliSourceEntryPath: "/fake/cli/main.ts",
      })

      yield* ensureHomeFolderExists.pipe(Effect.provide(layer))

      expect(fs.existsSync(path.join(homeDir, ".app"))).toBe(true)
      expect(fs.existsSync(path.join(homeDir, ".app", "hooks"))).toBe(true)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("writes getting-started.md with correct content", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        cliSourceEntryPath: "/fake/cli/main.ts",
      })

      yield* ensureHomeFolderExists.pipe(Effect.provide(layer))

      const content = fs.readFileSync(path.join(homeDir, ".app", "getting-started.md"), "utf-8")
      expect(content).toContain("welcome to spacecake")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("writes platform-specific statusline scripts", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        cliSourceEntryPath: "/fake/cli/main.ts",
      })

      yield* ensureHomeFolderExists.pipe(Effect.provide(layer))

      const hooksDir = path.join(homeDir, ".app", "hooks")
      if (isWindows) {
        expect(fs.existsSync(path.join(hooksDir, "statusline.cmd"))).toBe(true)
        expect(fs.existsSync(path.join(hooksDir, "statusline.ps1"))).toBe(true)
        const ps1Content = fs.readFileSync(path.join(hooksDir, "statusline.ps1"), "utf-8")
        expect(ps1Content).toContain("Invoke-RestMethod")
      } else {
        expect(fs.existsSync(path.join(hooksDir, "statusline.sh"))).toBe(true)
        const stat = fs.statSync(path.join(hooksDir, "statusline.sh"))
        // check owner-executable bit
        expect(stat.mode & 0o755).toBe(0o755)
      }
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("is idempotent — running twice does not fail", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        cliSourceEntryPath: "/fake/cli/main.ts",
      })

      yield* ensureHomeFolderExists.pipe(Effect.provide(layer))
      yield* ensureHomeFolderExists.pipe(Effect.provide(layer))

      expect(fs.existsSync(path.join(homeDir, ".app", "hooks"))).toBe(true)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})

// ---------------------------------------------------------------------------
// installCli — dev mode
// ---------------------------------------------------------------------------

describe("installCli — dev mode", () => {
  const wrapperName = isWindows ? "spacecake.cmd" : "spacecake"

  it.scoped("writes wrapper to appDir/bin", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: false,
        cliSourceEntryPath: "/fake/cli/src/main.ts",
      })

      yield* installCli.pipe(Effect.provide(layer))

      const wrapperPath = path.join(homeDir, ".app", "bin", wrapperName)
      expect(fs.existsSync(wrapperPath)).toBe(true)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("wrapper content contains correct cliSourceEntryPath", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const cliEntry = "/my/project/cli/src/main.ts"

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: false,
        cliSourceEntryPath: cliEntry,
      })

      yield* installCli.pipe(Effect.provide(layer))

      const content = fs.readFileSync(path.join(homeDir, ".app", "bin", wrapperName), "utf-8")
      expect(content).toContain(cliEntry)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("wrapper has executable permissions (unix only)", () =>
    Effect.gen(function* () {
      // windows doesn't support Unix permission modes
      if (isWindows) return

      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: false,
        cliSourceEntryPath: "/fake/cli/main.ts",
      })

      yield* installCli.pipe(Effect.provide(layer))

      const stat = fs.statSync(path.join(homeDir, ".app", "bin", "spacecake"))
      expect(stat.mode & 0o755).toBe(0o755)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("overwrites existing wrapper on re-run", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")

      const layer1 = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: false,
        cliSourceEntryPath: "/first/cli/main.ts",
      })

      yield* installCli.pipe(Effect.provide(layer1))

      const layer2 = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: false,
        cliSourceEntryPath: "/second/cli/main.ts",
      })

      yield* installCli.pipe(Effect.provide(layer2))

      const content = fs.readFileSync(path.join(homeDir, ".app", "bin", wrapperName), "utf-8")
      expect(content).toContain("/second/cli/main.ts")
      expect(content).not.toContain("/first/cli/main.ts")
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})

// ---------------------------------------------------------------------------
// installCli — packaged mode
// ---------------------------------------------------------------------------

describe("installCli — packaged mode", () => {
  it.scoped("creates symlink at globalBinTarget pointing to bundledCliBinaryPath", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const resPath = path.join(tempDir, "Resources")

      // Create the bundled binary
      fs.mkdirSync(path.join(resPath, "bin"), { recursive: true })
      fs.writeFileSync(path.join(resPath, "bin", "spacecake"), "#!/bin/sh\necho hello", {
        mode: 0o755,
      })

      const symlinkTarget = path.join(tempDir, "global-bin", "spacecake")
      fs.mkdirSync(path.join(tempDir, "global-bin"), { recursive: true })

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: true,
        resourcesPath: resPath,
        globalBinTarget: symlinkTarget,
      })

      yield* installCli.pipe(Effect.provide(layer))

      expect(fs.lstatSync(symlinkTarget).isSymbolicLink()).toBe(true)
      expect(fs.readlinkSync(symlinkTarget)).toBe(path.join(resPath, "bin", "spacecake"))
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("no-op when symlink already points to correct target", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const resPath = path.join(tempDir, "Resources")
      const bundledBin = path.join(resPath, "bin", "spacecake")

      fs.mkdirSync(path.join(resPath, "bin"), { recursive: true })
      fs.writeFileSync(bundledBin, "#!/bin/sh\necho hello", { mode: 0o755 })

      const symlinkTarget = path.join(tempDir, "global-bin", "spacecake")
      fs.mkdirSync(path.join(tempDir, "global-bin"), { recursive: true })
      fs.symlinkSync(bundledBin, symlinkTarget)

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: true,
        resourcesPath: resPath,
        globalBinTarget: symlinkTarget,
      })

      // Should not throw
      yield* installCli.pipe(Effect.provide(layer))

      expect(fs.readlinkSync(symlinkTarget)).toBe(bundledBin)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("updates symlink when pointing elsewhere", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const resPath = path.join(tempDir, "Resources")
      const bundledBin = path.join(resPath, "bin", "spacecake")

      fs.mkdirSync(path.join(resPath, "bin"), { recursive: true })
      fs.writeFileSync(bundledBin, "#!/bin/sh\necho hello", { mode: 0o755 })

      const symlinkTarget = path.join(tempDir, "global-bin", "spacecake")
      fs.mkdirSync(path.join(tempDir, "global-bin"), { recursive: true })
      fs.symlinkSync("/old/path/spacecake", symlinkTarget)

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: true,
        resourcesPath: resPath,
        globalBinTarget: symlinkTarget,
      })

      yield* installCli.pipe(Effect.provide(layer))

      expect(fs.readlinkSync(symlinkTarget)).toBe(bundledBin)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("skips when real file exists at target (not a symlink)", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const resPath = path.join(tempDir, "Resources")
      const bundledBin = path.join(resPath, "bin", "spacecake")

      fs.mkdirSync(path.join(resPath, "bin"), { recursive: true })
      fs.writeFileSync(bundledBin, "#!/bin/sh\necho hello", { mode: 0o755 })

      const symlinkTarget = path.join(tempDir, "global-bin", "spacecake")
      fs.mkdirSync(path.join(tempDir, "global-bin"), { recursive: true })
      // Write a real file (not a symlink)
      fs.writeFileSync(symlinkTarget, "#!/bin/sh\necho existing")

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: true,
        resourcesPath: resPath,
        globalBinTarget: symlinkTarget,
      })

      yield* installCli.pipe(Effect.provide(layer))

      // Should still be a real file, not a symlink
      expect(fs.lstatSync(symlinkTarget).isSymbolicLink()).toBe(false)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )

  it.scoped("handles missing bundled binary gracefully", () =>
    Effect.gen(function* () {
      const effectFs = yield* EffectFileSystem.FileSystem
      const tempDir = yield* effectFs.makeTempDirectoryScoped()
      const homeDir = path.join(tempDir, ".spacecake")
      const resPath = path.join(tempDir, "Resources")

      // Don't create the bundled binary
      const symlinkTarget = path.join(tempDir, "global-bin", "spacecake")
      fs.mkdirSync(path.join(tempDir, "global-bin"), { recursive: true })

      const layer = makeSpacecakeHomeTestLayer({
        homeDir,
        isPackaged: true,
        resourcesPath: resPath,
        globalBinTarget: symlinkTarget,
      })

      // Should not throw
      yield* installCli.pipe(Effect.provide(layer))

      // Symlink should not have been created
      expect(fs.existsSync(symlinkTarget)).toBe(false)
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  )
})
