import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
} from "electron"
import { installExtension, REACT_DEVELOPER_TOOLS } from "electron-devtools-installer"
import started from "electron-squirrel-startup"

import { buildCSPString } from "@/csp"
import { fixPath } from "@/main-process/fix-path"
import { ClaudeCodeServer } from "@/services/claude-code-server"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { CliServer } from "@/services/cli-server"
import { DatabaseMainLayer, makeDatabaseFromDumpLayer } from "@/services/database-main"
import { GitService } from "@/services/git"
import { Ipc } from "@/services/ipc"
import { migratePgliteFromIdb } from "@/services/migration-idb"
import { Migrations } from "@/services/migrations"
import { ensureHomeFolderExists, SpacecakeHome } from "@/services/spacecake-home"
import { setupUpdates } from "@/update"

performance.mark("spacecake/mainModuleEval")

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

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged

if (isDev) {
  app.name = "spacecake-dev"
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}
const isTest = process.env.IS_PLAYWRIGHT === "true"
const showWindow = process.env.SHOW_WINDOW === "true"

// register custom protocol scheme for proxying external resources (avoids CORB)
protocol.registerSchemesAsPrivileged([
  { scheme: "spacecake-img", privileges: { supportFetchAPI: true, corsEnabled: true } },
])

if (isTest) {
  crashReporter.start({ ignoreSystemCrashHandler: true, uploadToServer: false })
}

let quitRequested = false
let windowCounter = 0
let pendingWillShutdownPromise: Promise<void> | null = null
type AppLive = ReturnType<typeof buildAppLive>
let AppRuntime: ManagedRuntime.ManagedRuntime<
  Layer.Layer.Success<AppLive>,
  Layer.Layer.Error<AppLive>
> | null = null

/** Idempotent - returns the same promise if shutdown is already running */
function fireOnWillShutdown(): Promise<void> {
  if (pendingWillShutdownPromise) {
    return pendingWillShutdownPromise
  }

  if (!AppRuntime) {
    return Promise.resolve()
  }

  pendingWillShutdownPromise = AppRuntime.dispose().catch((err) => {
    console.error("Lifecycle: Error during shutdown", err)
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

// window controls overlay - macOS only needs `true`; Windows/Linux needs height + colors
function getTitleBarOverlay(dark: boolean): true | Electron.TitleBarOverlay {
  if (isMac) return true
  const colors = dark
    ? { color: "#171717", symbolColor: "#fafafa" }
    : { color: "#fafafa", symbolColor: "#0a0a0a" }
  return { ...colors, height: TITLEBAR_HEIGHT }
}

function buildAppMenu(win: BrowserWindow): Menu {
  const template: Electron.MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({ role: "appMenu" })
  }

  template.push({
    label: "File",
    submenu: [
      {
        label: "New File",
        accelerator: "CmdOrCtrl+N",
        registerAccelerator: false,
        click: () => win.webContents.send("menu:action", "new-file"),
      },
      {
        label: "Open Folder",
        accelerator: "CmdOrCtrl+O",
        registerAccelerator: false,
        click: () => win.webContents.send("menu:action", "open-folder"),
      },
      { type: "separator" },
      {
        label: "Clone Repository",
        accelerator: "CmdOrCtrl+Shift+C",
        click: () => win.webContents.send("menu:action", "clone-repo"),
      },
      {
        label: "New Repository",
        click: () => win.webContents.send("menu:action", "init-repo"),
      },
      { type: "separator" },
      {
        label: "Save",
        accelerator: "CmdOrCtrl+S",
        registerAccelerator: false,
        click: () => win.webContents.send("menu:action", "save"),
      },
      {
        label: "Save All",
        accelerator: "CmdOrCtrl+Shift+S",
        registerAccelerator: false,
        click: () => win.webContents.send("menu:action", "save-all"),
      },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  })

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" as const },
            { role: "delete" as const },
            { role: "selectAll" as const },
          ]
        : [
            { role: "delete" as const },
            { type: "separator" as const },
            { role: "selectAll" as const },
          ]),
      { type: "separator" },
      {
        label: "Find in Files",
        accelerator: "CmdOrCtrl+Shift+F",
        registerAccelerator: false,
        click: () => win.webContents.send("menu:action", "find-in-files"),
      },
    ],
  })
  template.push({ role: "viewMenu" })
  template.push({ role: "windowMenu" })

  return Menu.buildFromTemplate(template)
}

ipcMain.handle("set-title-bar-overlay", (event, dark: boolean) => {
  if (isMac) return
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.setTitleBarOverlay(getTitleBarOverlay(dark) as Electron.TitleBarOverlay)
})

ipcMain.handle("perf:get-main-marks", () => ({
  marks: performance
    .getEntriesByType("mark")
    .filter((m) => m.name.startsWith("spacecake/"))
    .map((m) => ({ name: m.name, startTime: Math.round(m.startTime) })),
  timeOrigin: performance.timeOrigin,
}))

ipcMain.handle("menu:popup", (event, { x, y }: { x: number; y: number }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const menu = Menu.getApplicationMenu()
  if (menu && win) {
    menu.popup({ window: win, x, y })
  }
})

const createWindow = (): BrowserWindow => {
  performance.mark("spacecake/willCreateWindow")
  const win = new BrowserWindow({
    icon: path.join(process.cwd(), "assets", "icon.png"),
    width: 800,
    height: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
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

  Menu.setApplicationMenu(buildAppMenu(win))

  windowCounter++

  // Intercept window.open calls and open URLs in external browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  win.once("closed", () => {
    windowCounter--
    if (windowCounter === 0 && (process.platform !== "darwin" || quitRequested)) {
      fireOnWillShutdown()
    }
  })

  win.once("ready-to-show", () => {
    if (!isTest || showWindow) {
      win.show()
      win.maximize()
    }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
  performance.mark("spacecake/didCreateWindow")

  const cspString = buildCSPString(isDev ? "development" : "production")
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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

  win.webContents.on("context-menu", (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ])
    menu.popup({ window: win })
  })

  if (isDev && (!isTest || showWindow)) {
    installExtension([REACT_DEVELOPER_TOOLS, LEXICAL_DEVELOPER_TOOLS])
      .then(([react, lexical]) => console.log(`added extensions: ${react.name}, ${lexical.name}`))
      .then(async () => await launchExtensionBackgroundWorkers())
      .then(() => win.webContents.openDevTools())
      .catch((err) => console.log("an error occurred: ", err))
  }

  return win
}

const SpacecakeHomeLive = SpacecakeHome.Default

function buildAppLive(
  dbLayer: Layer.Layer<
    import("@/services/database").Database,
    import("@/services/database").PgliteError,
    SpacecakeHome
  >,
) {
  return Layer.mergeAll(
    Ipc.Default,
    ClaudeCodeServer.Default,
    ClaudeHooksServer.Default,
    CliServer.Default,
    GitService.Default,
    Migrations.Default,
    SpacecakeHomeLive,
  ).pipe(Layer.provide(dbLayer), Layer.provide(SpacecakeHomeLive), Layer.provide(Layer.scope))
}

const setupProgram = Effect.gen(function* () {
  yield* ensureHomeFolderExists

  const migrations = yield* Migrations
  yield* migrations.apply

  // start CLI server early so `spacecake open` works before a workspace is opened
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
})

/**
 * determines which database layer to use based on filesystem state:
 * 1. PG_VERSION exists → normal startup (data already on disk)
 * 2. migration dump file exists → crash recovery (load dump)
 * 3. neither → attempt IndexedDB migration via hidden window
 */
async function resolveDatabaseLayer(): Promise<
  Layer.Layer<
    import("@/services/database").Database,
    import("@/services/database").PgliteError,
    SpacecakeHome
  >
> {
  const homeDir = process.env.SPACECAKE_HOME || path.join(app.getPath("home"), ".spacecake")
  const appDir = path.join(homeDir, ".app")
  const dataDir = path.join(appDir, "pglite-data")
  const pgVersionPath = path.join(dataDir, "PG_VERSION")
  const dumpPath = path.join(appDir, "migration-dump.tar.gz")

  // path 1: data already exists on disk
  if (fs.existsSync(pgVersionPath)) {
    return DatabaseMainLayer
  }

  // path 2: crash recovery - dump was saved but PGlite didn't load it yet
  if (fs.existsSync(dumpPath)) {
    console.log("migration: found existing dump file, restoring from crash recovery")
    return makeDatabaseFromDumpLayer(dumpPath)
  }

  // path 3: attempt migration from IndexedDB
  // only launch the hidden migration window if Chromium's IndexedDB storage
  // actually contains data - on fresh installs (and in tests) the directory
  // won't exist, so we skip straight to an empty database.
  const storagePath = session.defaultSession?.storagePath
  if (storagePath) {
    const idbDir = path.join(storagePath, "IndexedDB")
    const hasIdbData = fs.existsSync(idbDir) && fs.readdirSync(idbDir).length > 0

    if (!hasIdbData) {
      return DatabaseMainLayer
    }
  }

  console.log("migration: no PGlite data on disk, checking IndexedDB for existing data")
  const result = await migratePgliteFromIdb(appDir, dumpPath)

  if (result === "migrated") {
    console.log("migration: IndexedDB dump received, loading into filesystem PGlite")
    return makeDatabaseFromDumpLayer(dumpPath)
  }

  // fresh install or migration failed - use normal layer (creates empty db)
  return DatabaseMainLayer
}

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

  app.on("second-instance", () => {
    const windows = BrowserWindow.getAllWindows()
    const win = windows[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
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

  await app.whenReady()
  performance.mark("spacecake/appReady")

  // proxy external resources through the main process to avoid CORB.
  // renderer rewrites https://host/path to spacecake-img://https/host/path
  protocol.handle("spacecake-img", async (request) => {
    const raw = request.url.replace("spacecake-img://", "")
    // raw is "https/host/path?query" — restore the :// after the scheme
    const url = raw.replace(/^(https?)\//, "$1://")
    return net.fetch(url, { bypassCustomProtocolHandlers: true })
  })

  // readiness gate: renderer awaits this promise before making IPC calls.
  // registered before the window is created so it's available immediately.
  let resolveMainReady: () => void
  const mainReadyPromise = new Promise<void>((resolve) => {
    resolveMainReady = resolve
  })
  ipcMain.handle("main:wait-for-ready", () => mainReadyPromise)

  // start fixPath in the background — nothing in the setup phase needs $PATH
  // (PGlite is WASM, IPC is handler registration, migrations are SQL).
  // PATH is only needed when user triggers git/terminal/ripgrep after workspace loads.
  performance.mark("spacecake/willFixPath")
  const fixPathPromise = fixPath().then(() => performance.mark("spacecake/didFixPath"))

  // resolve the database layer (may run IndexedDB migration via hidden window)
  performance.mark("spacecake/willResolveDb")
  const dbLayer = await resolveDatabaseLayer()
  performance.mark("spacecake/didResolveDb")

  // create the window early so the renderer parses its JS while the main
  // process initializes Effect layers, PGlite, migrations, etc.
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  const AppLive = buildAppLive(dbLayer)
  AppRuntime = ManagedRuntime.make(AppLive)

  performance.mark("spacecake/willSetup")
  const exit = await AppRuntime!.runPromiseExit(setupProgram)
  performance.mark("spacecake/didSetup")

  if (Exit.isFailure(exit)) {
    console.error("Lifecycle: App setup failed", exit.cause)
    await AppRuntime!.dispose()
    app.exit(1)
    return
  }

  // ensure fixPath completes before signaling renderer ready
  await fixPathPromise

  // signal the renderer that IPC handlers are registered and ready
  resolveMainReady!()
}

main()
