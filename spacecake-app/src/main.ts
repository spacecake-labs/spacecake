import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import { app, BrowserWindow, session, shell } from "electron"
import { installExtension, REACT_DEVELOPER_TOOLS } from "electron-devtools-installer"
import started from "electron-squirrel-startup"
import fs from "node:fs"
import path from "node:path"

import { buildCSPString } from "@/csp"
import { fixPath } from "@/main-process/fix-path"
import { ClaudeCodeServer } from "@/services/claude-code-server"
import { ClaudeHooksServer } from "@/services/claude-hooks-server"
import { CliServer } from "@/services/cli-server"
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

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged
const isTest = process.env.IS_PLAYWRIGHT === "true"
const showWindow = process.env.SHOW_WINDOW === "true"

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

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    icon: path.join(process.cwd(), "assets", "icon.png"),
    width: 800,
    height: 600,
    show: !isTest || showWindow,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
