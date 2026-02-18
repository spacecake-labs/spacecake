import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
} from "electron"
import { installExtension, REACT_DEVELOPER_TOOLS } from "electron-devtools-installer"
import started from "electron-squirrel-startup"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { buildCSPString } from "@/csp"
import { fixPath } from "@/main-process/fix-path"
import { ClaudeCodeServer } from "@/services/claude-code-server"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { CliServer } from "@/services/cli-server"
import { GitService } from "@/services/git"
import { Ipc } from "@/services/ipc"
import { ensureHomeFolderExists, SpacecakeHome } from "@/services/spacecake-home"
import { setupUpdates } from "@/update"

const LEXICAL_DEVELOPER_TOOLS = "kgljmdocanfjckcgfpcpdoklodllfdpc"

// fix for react dev tools service worker issue
async function launchExtensionBackgroundWorkers(sessionInstance = session.defaultSession) {
  const extensions = sessionInstance.extensions.getAllExtensions()
  return Promise.all(
    extensions.map(async (extension) => {
      const manifest = extension.manifest
      if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
        await sessionInstance.serviceWorkers.startWorkerForScope(extension.url)
      }
    }),
  )
}

if (started) {
  app.quit()
}

// sharper text rendering — use gpu rasterization and disable lcd text
// (lcd/subpixel antialiasing looks blurry on non-retina and mixed-dpi setups)
app.commandLine.appendSwitch("enable-gpu-rasterization")
app.commandLine.appendSwitch("disable-lcd-text")

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged
const isTest = process.env.IS_PLAYWRIGHT === "true"
const showWindow = process.env.SHOW_WINDOW === "true"

if (isTest) {
  crashReporter.start({ ignoreSystemCrashHandler: true, uploadToServer: false })
}

let quitRequested = false
let windowCounter = 0
let pendingWillShutdownPromise: Promise<void> | null = null

const SHUTDOWN_TIMEOUT_MS = 3000

/** Idempotent - returns the same promise if shutdown is already running */
function fireOnWillShutdown(): Promise<void> {
  if (pendingWillShutdownPromise) {
    return pendingWillShutdownPromise
  }

  const timeout = setTimeout(() => {
    console.error("Lifecycle: Shutdown timed out, force exiting")
    app.exit(0)
  }, SHUTDOWN_TIMEOUT_MS)
  timeout.unref()

  pendingWillShutdownPromise = AppRuntime.dispose()
    .catch((err) => {
      console.error("Lifecycle: Error during shutdown", err)
    })
    .finally(() => {
      clearTimeout(timeout)
    })

  return pendingWillShutdownPromise
}

const beforeQuitListener = () => {
  if (quitRequested) {
    return
  }
  quitRequested = true

  // macOS can run without any window open, so fire shutdown directly
  if (process.platform === "darwin" && windowCounter === 0) {
    fireOnWillShutdown()
  }
}

const windowAllClosedListener = () => {
  if (quitRequested || process.platform !== "darwin") {
    app.quit()
  }
}

// --- title bar height & traffic light centering ---
// macOS Tahoe (26+) shrank traffic light buttons from 16px to 14px and increased
// the native title bar height from 28px to 32px.  Detection uses the Darwin
// kernel version returned by os.release() (>= 25 → Tahoe).
// see: github.com/desktop/desktop/issues/21135
const isMac = process.platform === "darwin"
const isTahoe = isMac && parseFloat(os.release()) >= 25

// target visual titlebar height (drag strip + existing layout padding).
// macOS: 28 pre-Tahoe, 32 Tahoe (native title bar height)
// Windows/Linux: 30px
// the sidebar (pt-2) and main content panel (p-2) each add 8px of top padding
// below the drag strip, so the strip itself is reduced by that amount.
const LAYOUT_TOP_PADDING = 8
const TITLEBAR_HEIGHT = isMac ? (isTahoe ? 32 : 28) : 30
const DRAG_STRIP_HEIGHT = TITLEBAR_HEIGHT - LAYOUT_TOP_PADDING

// macOS traffic light centering
const TRAFFIC_LIGHT_BUTTON_HEIGHT = isTahoe ? 14 : 16

function getTrafficLightPosition(titlebarHeight: number): Electron.Point {
  const offset = Math.floor((titlebarHeight - TRAFFIC_LIGHT_BUTTON_HEIGHT) / 2)
  return { x: offset + 1, y: offset }
}

// window controls overlay — macOS only needs `true`; Windows/Linux needs height + colors
function getTitleBarOverlay(dark: boolean): true | Electron.TitleBarOverlay {
  if (isMac) return true
  const colors = dark
    ? { color: "#171717", symbolColor: "#fafafa" }
    : { color: "#fafafa", symbolColor: "#0a0a0a" }
  return { ...colors, height: TITLEBAR_HEIGHT }
}

ipcMain.handle("set-title-bar-overlay", (event, dark: boolean) => {
  if (isMac) return
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.setTitleBarOverlay(getTitleBarOverlay(dark) as Electron.TitleBarOverlay)
})

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    icon: path.join(process.cwd(), "assets", "icon.png"),
    width: 800,
    height: 600,
    show: !isTest || showWindow,
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(nativeTheme.shouldUseDarkColors),
    ...(isMac ? { trafficLightPosition: getTrafficLightPosition(TITLEBAR_HEIGHT) } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: [`--titlebar-height=${DRAG_STRIP_HEIGHT}`],
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: true,
      webgl: true,
    },
  })

  windowCounter++

  // Intercept window.open calls and open URLs in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.once("closed", () => {
    windowCounter--
    if (windowCounter === 0 && (process.platform !== "darwin" || quitRequested)) {
      fireOnWillShutdown()
    }
  })

  if (!isTest || showWindow) {
    mainWindow.maximize()
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  const cspString = buildCSPString(isDev ? "development" : "production")
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith("devtools://") || details.url.startsWith("chrome-extension://")) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [cspString],
      },
    })
  })

  mainWindow.webContents.on("context-menu", (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ])
    menu.popup({ window: mainWindow })
  })

  if (isDev && (!isTest || showWindow)) {
    installExtension([REACT_DEVELOPER_TOOLS, LEXICAL_DEVELOPER_TOOLS])
      .then(([react, lexical]) => console.log(`added extensions: ${react.name}, ${lexical.name}`))
      .then(async () => await launchExtensionBackgroundWorkers())
      .then(() => mainWindow.webContents.openDevTools())
      .catch((err) => console.log("an error occurred: ", err))
  }
}

const SpacecakeHomeLive = SpacecakeHome.Default

const AppLive = Layer.mergeAll(
  Ipc.Default,
  ClaudeCodeServer.Default,
  ClaudeHooksServer.Default,
  CliServer.Default,
  GitService.Default,
  SpacecakeHomeLive,
).pipe(Layer.provide(SpacecakeHomeLive), Layer.provide(Layer.scope))

const AppRuntime = ManagedRuntime.make(AppLive)

const setupProgram = Effect.gen(function* () {
  yield* Effect.promise(() => app.whenReady())
  yield* Effect.promise(() => fixPath())
  yield* ensureHomeFolderExists

  // Start CLI server early so `spacecake open` works before a workspace is opened
  const cliServer = yield* CliServer
  yield* Effect.promise(() => cliServer.ensureStarted([]))

  if (!app.isPackaged) {
    const userDataPath = app.getPath("userData")
    const devPath = path.join(userDataPath, "dev")
    fs.mkdirSync(devPath, { recursive: true })
    app.setPath("userData", devPath)
  }

  if (!app.isPackaged && app.dock) {
    app.dock.setIcon(path.join(process.cwd(), "assets", "icon.png"))
  }

  if (!isTest) {
    setupUpdates()
  }

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

async function main() {
  // Silence write errors on broken stdout/stderr (e.g. Linux terminal closed
  // after app launch). Without this, any console.log crashes the app.
  // See: https://github.com/microsoft/vscode/pull/186717
  function isBrokenStdoutError(e: unknown): boolean {
    if (!e || typeof e !== "object") return false
    const err = e as NodeJS.ErrnoException
    return (err.code === "EPIPE" || err.code === "EIO") && err.syscall === "write"
  }

  process.stdout.on("error", () => {})
  process.stderr.on("error", () => {})

  process.on("uncaughtException", (error) => {
    if (isBrokenStdoutError(error)) return
    console.error("Uncaught exception in main process:", error)
  })

  process.on("unhandledRejection", (reason) => {
    if (isBrokenStdoutError(reason)) return
    console.error("Unhandled rejection in main process:", reason)
  })

  app.addListener("before-quit", beforeQuitListener)
  app.addListener("window-all-closed", windowAllClosedListener)

  // Attach shutdown promise chain directly inside the handler to keep
  // execution context connected to Electron's event system
  app.once("will-quit", (e) => {
    e.preventDefault()
    fireOnWillShutdown().finally(() => {
      app.removeListener("before-quit", beforeQuitListener)
      app.removeListener("window-all-closed", windowAllClosedListener)
      app.quit()
    })
  })

  const exit = await AppRuntime.runPromiseExit(setupProgram)

  if (Exit.isFailure(exit)) {
    console.error("Lifecycle: App setup failed", exit.cause)
    await AppRuntime.dispose()
    app.exit(1)
  }
}

main()
