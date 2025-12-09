import fs from "node:fs"
import path from "node:path"

import { buildCSPString } from "@/csp"
import * as ParcelWatcher from "@/main-process/parcel-watcher"
import { watcherService } from "@/main-process/watcher"
import { Ipc } from "@/services/ipc"
import { setupUpdates } from "@/update"
import { NodeFileSystem, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { app, BrowserWindow, session } from "electron"
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer"
import started from "electron-squirrel-startup"

const LEXICAL_DEVELOPER_TOOLS = "kgljmdocanfjckcgfpcpdoklodllfdpc"

// fix for react dev tools service worker issue
async function launchExtensionBackgroundWorkers(
  sessionInstance = session.defaultSession
) {
  const extensions = sessionInstance.extensions.getAllExtensions()
  return Promise.all(
    extensions.map(async (extension) => {
      const manifest = extension.manifest
      if (
        manifest.manifest_version === 3 &&
        manifest?.background?.service_worker
      ) {
        await sessionInstance.serviceWorkers.startWorkerForScope(extension.url)
      }
    })
  )
}

if (started) {
  app.quit()
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged
const isTest = process.env.IS_PLAYWRIGHT === "true"
const showWindow = process.env.SHOW_WINDOW === "true"

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    icon: path.join(process.cwd(), "assets", "icon.png"),
    width: 800,
    height: 600,
    show: !isTest || showWindow,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: true,
    },
  })

  if (!isTest || showWindow) {
    mainWindow.maximize()
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    )
  }

  const cspString = buildCSPString(isDev ? "development" : "production")
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [cspString],
        },
      })
    }
  )

  if (isDev && (!isTest || showWindow)) {
    installExtension([REACT_DEVELOPER_TOOLS, LEXICAL_DEVELOPER_TOOLS])
      .then(([react, lexical]) =>
        console.log(`added extensions: ${react.name}, ${lexical.name}`)
      )
      .then(async () => await launchExtensionBackgroundWorkers())
      .then(() => mainWindow.webContents.openDevTools())
      .catch((err) => console.log("an error occurred: ", err))
  }
}

const WatcherLive = NodeFileSystem.layer.pipe(
  Layer.provide(ParcelWatcher.layer)
)

// The final composed layer for the whole app.
// Layer.merge combines independent layers.
const AppLive = Layer.mergeAll(Ipc.Default, WatcherLive)

// --- Main Program
const program = Effect.gen(function* (_) {
  yield* _(Effect.promise(() => app.whenReady()))

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

  // The watcher service still needs its specific layer context
  yield* _(Effect.forkDaemon(watcherService.pipe(Effect.provide(WatcherLive))))

  app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // not sure why this works but it seems to prevent macOS complaining
  // that the app 'quit unexpectedly' when running Playwright tests.
  if (isTest) {
    app.on("before-quit", (e) => {
      e.preventDefault()
      app.quit()
    })
  }

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  yield* _(Effect.never)
})

// --- Main Execution
// A separate effect that provides the services and handles errors
const main = Effect.scoped(program).pipe(
  Effect.provide(AppLive),
  Effect.catchAll(Effect.logError)
)

NodeRuntime.runMain(main)
