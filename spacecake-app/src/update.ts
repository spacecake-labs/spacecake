import { app, dialog } from "electron"
import { createWriteStream } from "node:fs"
import { chmod, unlink, rename } from "node:fs/promises"
import * as https from "node:https"

const REPO = "spacecake-labs/spacecake"
const UPDATE_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

interface GithubRelease {
  tag_name: string
  name: string
  assets: Array<{ name: string; browser_download_url: string }>
}

/**
 * AppImage-specific updater for Linux
 */
async function setupAppImageUpdater() {
  const appImagePath = process.env["APPIMAGE"]
  if (!appImagePath) {
    console.log("[updater] Not running as AppImage, skipping Linux updater")
    return
  }

  const checkForUpdates = async () => {
    try {
      const currentVersion = app.getVersion()
      const release = await fetchLatestRelease()
      const latestVersion = release.tag_name.replace(/^v/, "")

      if (latestVersion === currentVersion) {
        console.log("[updater] Already on latest version:", currentVersion)
        return
      }

      console.log(`[updater] Update available: ${currentVersion} -> ${latestVersion}`)

      const asset = release.assets.find((a) => a.name.endsWith(".AppImage"))
      if (!asset) {
        console.log("[updater] No AppImage found in release assets")
        return
      }

      // Download silently first (matches update-electron-app behavior)
      console.log("[updater] Downloading update...")
      const tempPath = `${appImagePath}.download`
      await downloadFile(asset.browser_download_url, tempPath)
      await chmod(tempPath, 0o755)
      console.log("[updater] Download complete")

      // Show dialog with exact same text as update-electron-app
      const { response } = await dialog.showMessageBox({
        type: "info",
        buttons: ["Restart", "Later"],
        title: "Application Update",
        message: release.name || release.tag_name,
        detail: "A new version has been downloaded. Restart the application to apply the updates.",
      })

      if (response === 0) {
        await installAndRestart(appImagePath, tempPath)
      }
    } catch (err) {
      console.error("[updater] Error checking for updates:", err)
    }
  }

  // Initial check after 10s, then every hour
  setTimeout(checkForUpdates, 10_000)
  setInterval(checkForUpdates, UPDATE_INTERVAL_MS)
}

async function installAndRestart(currentAppImage: string, newAppImage: string) {
  await unlink(currentAppImage)
  await rename(newAppImage, currentAppImage)
  app.relaunch()
  app.quit()
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        { headers: { "User-Agent": "spacecake-updater" } },
        (res) => {
          let data = ""
          res.on("data", (chunk) => (data += chunk))
          res.on("end", () => {
            if (res.statusCode !== 200) {
              reject(new Error(`GitHub API error: ${res.statusCode}`))
              return
            }
            resolve(JSON.parse(data))
          })
        },
      )
      .on("error", reject)
  })
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)

    const request = (targetUrl: string) => {
      https
        .get(targetUrl, { headers: { "User-Agent": "spacecake-updater" } }, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            request(res.headers.location!)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: ${res.statusCode}`))
            return
          }

          res.pipe(file)
          file.on("finish", () => {
            file.close()
            resolve()
          })
        })
        .on("error", (err) => {
          unlink(dest).catch(() => {})
          reject(err)
        })
    }

    request(url)
  })
}

/**
 * Sets up the update service
 */
export async function setupUpdates() {
  // Don't run in development
  if (!app.isPackaged) {
    console.log("[updater] Skipping updates in development mode")
    return
  }

  // Linux AppImage: use custom updater
  if (process.platform === "linux" && process.env["APPIMAGE"]) {
    await setupAppImageUpdater()
    return
  }

  // macOS/Windows: use update-electron-app
  setTimeout(async () => {
    const { updateElectronApp } = await import("update-electron-app")
    updateElectronApp({
      repo: REPO,
      updateInterval: "1 hour",
    })
  }, 10_000)
}
