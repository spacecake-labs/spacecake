import fs from "fs"
import os from "os"
import path from "path"

import {
  _electron,
  test as base,
  ElectronApplication,
  expect,
  Page,
} from "@playwright/test"

export type TestFixtures = {
  electronApp: ElectronApplication
  tempTestDir: string
}
export const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  tempTestDir: async ({}, use, testInfo) => {
    const testOutputRoot = path.join(process.cwd(), "test-output")
    const workerTempRoot = path.join(
      testOutputRoot,
      `worker-${testInfo.workerIndex}`
    )
    fs.mkdirSync(workerTempRoot, { recursive: true })
    const tempDir = fs.mkdtempSync(path.join(workerTempRoot, "spacecake-e2e-"))

    testInfo.annotations.push({
      type: "info",
      description: `created temp test directory: ${tempDir}`,
    })

    await use(tempDir)

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5 })
      testInfo.annotations.push({
        type: "info",
        description: `cleaned up temp test directory: ${tempDir}`,
      })
    }
  },

  electronApp: async ({ tempTestDir }, use, testInfo) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-e2e-data"))

    const app = await _electron.launch({
      args: [
        ".vite/build/main.js",
        `--user-data-dir=${dataDir}`, // isolate electron data per test
      ],
      env: {
        ...process.env,
        SPACECAKE_HOME: tempTestDir, // isolate home folder per test
      },
      cwd: process.cwd(),
      timeout: 60000,
    })

    // log electron process output
    // app.process()?.stdout?.on("data", (data) => console.log(`stdout: ${data}`))
    // app
    //   .process()
    //   ?.stderr?.on("data", (error) => console.log(`stderr: ${error}`))

    // clear localStorage before each test
    const page = await app.firstWindow()
    try {
      await page.evaluate(() => {
        localStorage.clear()
      })

      // disable animations and force-hide closed radix components to prevent
      // race conditions where playwright checks visibility before the unmount
      // animation finishes.
      await page.addStyleTag({
        content: `
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
      `,
      })
    } catch (error) {
      console.warn("could not clear localStorage or disable animations:", error)
    }

    await use(app)

    // On Linux, graceful close can hang due to WebSocket cleanup issues.
    // Use a timeout with force-kill fallback. Shorter timeout on CI since
    // speed matters more than graceful cleanup there.
    const closeTimeout = process.env.CI ? 1000 : 5000
    let timeoutId: NodeJS.Timeout | null = null
    const closePromise = app.close().finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn("app.close() timed out, force killing process")
        try {
          const proc = app.process()
          if (proc && !proc.killed) {
            proc.kill("SIGKILL")
          }
        } catch {
          // app already closed, ignore
        }
        resolve()
      }, closeTimeout)
    })
    await Promise.race([closePromise, timeoutPromise])

    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 })
      testInfo.annotations.push({
        type: "info",
        description: `cleaned up temp data directory: ${dataDir}`,
      })
    }
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
  await expect(
    page.getByRole("button", { name: "create file or folder" })
  ).toBeVisible()
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
  absoluteFilePath: string
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
