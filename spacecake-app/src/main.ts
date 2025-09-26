import path from "node:path"

import { buildCSPString } from "@/csp"
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { app, BrowserWindow } from "electron"
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer"
import started from "electron-squirrel-startup"

// Import IPC handlers to register them.
import "@/main-process/ipc-handlers"

const LEXICAL_DEVELOPER_TOOLS = "kgljmdocanfjckcgfpcpdoklodllfdpc"

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit()
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged
const isTest = process.env.IS_PLAYWRIGHT === "true"
const showWindow = process.env.SHOW_WINDOW === "true"

// This function contains side-effects and is not wrapped in Effect.
// This is a pragmatic choice to avoid over-complicating the refactoring.
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

  if (isDev && !isTest) {
    installExtension([REACT_DEVELOPER_TOOLS, LEXICAL_DEVELOPER_TOOLS])
      .then(([react, lexical]) =>
        console.log(`added extensions: ${react.name}, ${lexical.name}`)
      )
      .then(() => mainWindow.webContents.openDevTools())
      .catch((err) => console.log("an error occurred: ", err))
  }
}

const mainProgram = Effect.gen(function* (_) {
  yield* _(Effect.promise(() => app.whenReady()))

  if (!app.isPackaged && app.dock) {
    app.dock.setIcon(path.join(process.cwd(), "assets", "icon.png"))
  }

  createWindow()

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
}).pipe(Effect.scoped, Effect.catchAll(Effect.logError))

NodeRuntime.runMain(mainProgram)
