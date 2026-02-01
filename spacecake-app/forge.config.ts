import type { ForgeConfig } from "@electron-forge/shared-types"

import { MakerDeb } from "@electron-forge/maker-deb"
import { MakerZIP } from "@electron-forge/maker-zip"
// import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives"
import { FusesPlugin } from "@electron-forge/plugin-fuses"
import { VitePlugin } from "@electron-forge/plugin-vite"
import { FuseV1Options, FuseVersion } from "@electron/fuses"
import { cp, mkdir } from "node:fs/promises"
import path from "path"

/* The customisation is necessary for @parcel/watcher.
Source: https://www.danielcorin.com/posts/2024/challenges-building-an-electron-app/
*/

function getPlatformArchSpecificPackages(platform: string, arch: string): string[] {
  const universalPackages = [
    "@parcel/watcher",
    "@lydell/node-pty",
    "micromatch",
    "braces",
    "fill-range",
    "to-regex-range",
    "is-number",
    "picomatch",
    "detect-libc",
    "is-glob",
    "is-extglob",
    "node-addon-api",
  ]

  const platformArchSpecificPackages: Record<string, Record<string, string[]>> = {
    darwin: {
      arm64: ["@parcel/watcher-darwin-arm64", "@lydell/node-pty-darwin-arm64"],
      x64: ["@parcel/watcher-darwin-x64", "@lydell/node-pty-darwin-x64"],
    },
    win32: {
      x64: ["@parcel/watcher-win32-x64"],
      arm64: ["@parcel/watcher-win32-arm64"],
    },
    linux: {
      x64: ["@parcel/watcher-linux-x64-glibc", "@lydell/node-pty-linux-x64"],
      arm64: ["@parcel/watcher-linux-arm64-glibc"],
    },
  }

  const platformSpecific = platformArchSpecificPackages[platform]?.[arch] || []
  return [...universalPackages, ...platformSpecific]
}

const commonLinuxConfig = {
  categories: ["Development"] as ("Development" | "Utility")[],
  homepage: "https://spacecake.ai",
}

const config: ForgeConfig = {
  hooks: {
    async packageAfterCopy(_forgeConfig, buildPath, _electronVersion, platform, arch) {
      const requiredNativePackages = getPlatformArchSpecificPackages(platform, arch)

      const sourceNodeModulesPath = path.resolve(__dirname, "node_modules")
      const destNodeModulesPath = path.resolve(buildPath, "node_modules")

      await Promise.all(
        requiredNativePackages.map(async (packageName) => {
          const sourcePath = path.join(sourceNodeModulesPath, packageName)
          const destPath = path.join(destNodeModulesPath, packageName)

          await mkdir(path.dirname(destPath), { recursive: true })
          await cp(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
            filter: (src) => !src.includes(path.join("node_modules", ".bin")),
          })
        }),
      )

      // Bundle the CLI binary into the app's resources/bin directory
      const cliBinarySource = path.resolve(__dirname, "../cli/dist/spacecake")
      const cliBinaryDest = path.resolve(buildPath, "../bin/spacecake")

      try {
        await mkdir(path.dirname(cliBinaryDest), { recursive: true })
        await cp(cliBinarySource, cliBinaryDest, { preserveTimestamps: true })
        console.log(`Bundled CLI binary: ${cliBinarySource} -> ${cliBinaryDest}`)
      } catch {
        console.warn(
          "CLI binary not found at",
          cliBinarySource,
          "— skipping. Run `cd cli && bun run build` first.",
        )
      }
    },
  },
  plugins: [
    // new AutoUnpackNativesPlugin({ unpackDir: "{@parcel/watcher}" }),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  packagerConfig: {
    appBundleId: "ai.spacecake",
    executableName: "spacecake",
    asar: {
      unpack: "*.{node,dylib,dll,so}",
      unpackDir: "**/node_modules/{@parcel/watcher*,@lydell/node-pty*}",
    },
    icon: "./assets/icon", // no file extension required
  },
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: "./assets/icon.icns",
      },
    },
    new MakerDeb({
      options: commonLinuxConfig,
    }),
    {
      name: "@reforged/maker-appimage",
      platforms: ["linux"],
      config: {
        options: commonLinuxConfig,
      },
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "spacecake-labs",
          name: "spacecake",
        },
        prerelease: true,
        draft: true,
      },
    },
  ],
}

function maybeMac() {
  if (process.platform !== "darwin") {
    return
  }

  if (!process.env.APPLE_SIGN_ID) {
    console.warn("Should be signing, but environment variable APPLE_SIGN_ID is missing!")
    return
  }

  config.packagerConfig!.osxSign = {
    identity: process.env.APPLE_SIGN_ID,
  }

  if (!process.env.CI && !process.env.FORCE_NOTARIZATION) {
    // Not in CI, skipping notarization
    console.log("Not in CI, skipping notarization")
    return
  }

  if (!process.env.APPLE_ID) {
    console.warn("Should be notarizing, but environment variable APPLE_ID is missing!")
    return
  }

  if (!process.env.APPLE_PASSWORD) {
    console.warn("Should be notarizing, but environment variable APPLE_PASSWORD is missing!")
    return
  }

  if (!process.env.APPLE_TEAM_ID) {
    console.warn("Should be notarizing, but environment variable APPLE_TEAM_ID is missing!")
    return
  }

  config.packagerConfig!.osxNotarize = {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  }
}

maybeMac()

export default config
