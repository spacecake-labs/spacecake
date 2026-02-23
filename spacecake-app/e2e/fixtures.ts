import { _electron, test as base, ElectronApplication, expect, Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import treeKill from "tree-kill"

const ANIMATION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
  [data-slot="dialog-content"][data-state="closed"],
  [data-slot="dialog-overlay"][data-state="closed"],
  [data-slot="dropdown-menu-content"][data-state="closed"],
  [data-slot="dropdown-menu-sub-content"][data-state="closed"] {
    display: none !important;
  }
`

export type TestFixtures = {
  electronApp: ElectronApplication
  window: Page
  tempTestDir: string
}

type WorkerFixtures = {
  workspaceDir: string
  sharedElectronApp: ElectronApplication
}

// per-worker state (each playwright worker is a separate process)
let capturedAppUrl = ""
let isFirstTest = true

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // --- worker-scoped fixtures (created once per worker) ---

  workspaceDir: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const testOutputRoot = path.join(fs.realpathSync(os.tmpdir()), "spacecake-e2e")
      const workerDir = path.join(testOutputRoot, `worker-${workerInfo.workerIndex}`)
      fs.mkdirSync(workerDir, { recursive: true })
      const dir = fs.mkdtempSync(path.join(workerDir, "spacecake-e2e-"))

      await use(dir)

      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
      }
    },
    { scope: "worker" },
  ],

  sharedElectronApp: [
    async ({ workspaceDir }, use) => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-e2e-data"))
      let app: ElectronApplication | null = null

      const forceKillApp = () => {
        if (!app) return
        try {
          const proc = app.process()
          if (proc?.pid && !proc.killed) {
            treeKill(proc.pid, "SIGKILL")
          }
        } catch {
          // already dead, ignore
        }
      }

      const cleanupDataDir = () => {
        if (fs.existsSync(dataDir)) {
          fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 })
        }
      }

      try {
        app = await _electron.launch({
          args: [".vite/build/main.js", `--user-data-dir=${dataDir}`],
          env: {
            ...process.env,
            SPACECAKE_HOME: workspaceDir,
          },
          cwd: process.cwd(),
          timeout: 60000,
        })

        const page = await app.firstWindow()

        // capture the app URL for between-test reset navigation
        capturedAppUrl = page.url()
        isFirstTest = true

        try {
          await page.evaluate(() => {
            localStorage.clear()
          })

          await page.addStyleTag({ content: ANIMATION_CSS })
        } catch (error) {
          console.warn("could not clear localStorage or disable animations:", error)
        }
      } catch (error) {
        forceKillApp()
        cleanupDataDir()
        throw error
      }

      await use(app)

      try {
        await app.evaluate(({ app }) => app.quit())
      } catch {
        // app may have already closed, ignore
      }

      // on Linux, graceful close can hang due to WebSocket cleanup issues.
      // use a timeout with force-kill fallback.
      const closeTimeout = process.env.CI ? 1000 : 5000
      let timeoutId: NodeJS.Timeout | null = null
      const closePromise = app.close().finally(() => {
        if (timeoutId) clearTimeout(timeoutId)
      })
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn("app.close() timed out, force killing process tree")
          forceKillApp()
          resolve()
        }, closeTimeout)
      })
      await Promise.race([closePromise, timeoutPromise])

      cleanupDataDir()
    },
    { scope: "worker", timeout: 60_000 },
  ],

  // --- test-scoped fixtures ---

  electronApp: async ({ sharedElectronApp }, use) => {
    await use(sharedElectronApp)
  },

  window: async ({ sharedElectronApp, workspaceDir }, use) => {
    const page = await sharedElectronApp.firstWindow()

    if (!isFirstTest) {
      // between-test reset sequence:

      // 1. clean workspace dir files (keep .app/)
      fs.mkdirSync(workspaceDir, { recursive: true })
      for (const entry of fs.readdirSync(workspaceDir)) {
        if (entry === ".app") continue
        fs.rmSync(path.join(workspaceDir, entry), { recursive: true, force: true })
      }

      // 2. navigate to about:blank (tears down renderer + PGlite web worker)
      await page.goto("about:blank")

      // 3. clear IDB + localStorage via Electron's session.clearStorageData
      await sharedElectronApp.evaluate(async ({ session }) => {
        await session.defaultSession.clearStorageData({
          storages: ["indexdb", "localstorage"],
        })
      })

      // 4. navigate back to the app URL (fresh renderer init: PGlite WASM + migrations)
      await page.goto(capturedAppUrl)

      // 5. re-inject animation-disabling CSS
      try {
        await page.addStyleTag({ content: ANIMATION_CSS })
      } catch (error) {
        console.warn("could not re-inject animation CSS:", error)
      }
    }

    isFirstTest = false

    await use(page)
  },

  tempTestDir: async ({ workspaceDir }, use) => {
    await use(workspaceDir)
  },
})

export { expect }

/**
 * Waits for the workspace to be ready (home folder loads automatically).
 * Each test has its own isolated home folder via SPACECAKE_HOME env var.
 *
 * @param page - The Playwright page instance
 */
export async function waitForWorkspace(page: Page) {
  // wait for the workspace to load (indicated by the create file button appearing)
  await expect(page.getByRole("button", { name: "create file or folder" })).toBeVisible()
}

/**
 * For a given absolute file path, asserts that every non-empty line of the file
 * is rendered somewhere in the editor and therefore visible/selectable by text.
 *
 * - Skips blank lines
 * - Trims leading/trailing whitespace for matching stability
 */
export async function expectAllNonEmptyLinesVisible(
  page: Page,
  absoluteFilePath: string,
): Promise<void> {
  const content = fs.readFileSync(absoluteFilePath, "utf-8")
  const lines = content.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    // handle python docstring first/last lines now rendered without triple quotes
    const strippedTripleQuotes = trimmed
      .replace(/^r?"""/, "")
      .replace(/"""$/, "")
      .trim()

    // handle python markdown directives (strip #🍰 prefixes)
    const strippedMdoc = trimmed.replace(/^#🍰\s?/, "").trim()

    if (trimmed.startsWith('"""') || trimmed.startsWith('r"""')) {
      await expect(page.getByText(strippedTripleQuotes).first()).toBeVisible()
    } else if (trimmed.endsWith('"""')) {
      // closing triple quote line in fixture; content likely on previous line, so skip
      continue
    } else if (trimmed.startsWith("#🍰")) {
      // markdown directive line - check for the content without the prefix
      if (strippedMdoc.length > 0) {
        // If it's a markdown header (starts with #), look for the text without the header syntax
        if (strippedMdoc.startsWith("#")) {
          const headerText = strippedMdoc.replace(/^#+\s*/, "").trim()
          if (headerText.length > 0) {
            await expect(page.getByText(headerText).first()).toBeVisible()
          }
        } else {
          // Regular markdown content
          await expect(page.getByText(strippedMdoc).first()).toBeVisible()
        }
      }
    } else {
      await expect(page.getByText(trimmed).first()).toBeVisible()
    }
  }
}
