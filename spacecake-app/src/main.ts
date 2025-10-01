import path from "node:path"

import { buildCSPString } from "@/csp"
import { watcherService } from "@/main-process/watcher"
import { Ipc } from "@/services/ipc"
import { NodeFileSystem, NodeRuntime } from "@effect/platform-node"
import * as ParcelWatcher from "@effect/platform-node/NodeFileSystem/ParcelWatcher"
import { Effect, Layer } from "effect"
import { app, BrowserWindow } from "electron"
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer"
import started from "electron-squirrel-startup"

const LEXICAL_DEVELOPER_TOOLS = "kgljmdocanfjckcgfpcpdoklodllfdpc"

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
      .then(() => mainWindow.webContents.openDevTools())
      .catch((err) => console.log("an error occurred: ", err))
  }
}

const WatcherLive = NodeFileSystem.layer.pipe(
  Layer.provide(ParcelWatcher.layer)
)

// The final composed layer for the whole app.
// Layer.merge combines independent layers.
const AppLive = Layer.merge(Ipc.Default, WatcherLive)

// --- Main Program
const program = Effect.gen(function* (_) {
  yield* _(Effect.promise(() => app.whenReady()))

  if (!app.isPackaged && app.dock) {
    app.dock.setIcon(path.join(process.cwd(), "assets", "icon.png"))
  }

  createWindow()

  // The watcher service still needs its specific layer context
  yield* _(Effect.forkDaemon(watcherService.pipe(Effect.provide(WatcherLive))))

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on("window-all-closed", () => {
    if (isTest || process.platform !== "darwin") {
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
