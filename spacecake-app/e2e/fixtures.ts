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
  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: [".vite/build/main.js"],
      cwd: process.cwd(),
      timeout: 60000,
    })

    // clear localStorage before each test to prevent interference
    const page = await app.firstWindow()
    try {
      await page.evaluate(() => {
        localStorage.clear()
      })
    } catch (error) {
      // localStorage might not be available in some contexts
      console.warn("Could not clear localStorage:", error)
    }

    await use(app)

    await app.close()
  },

  tempTestDir: async ({ electronApp }, use, testInfo) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-e2e-"))
    testInfo.annotations.push({
      type: "info",
      description: `created temp test directory: ${tempDir}`,
    })

    await use(tempDir)

    await electronApp.close()

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5 })
      testInfo.annotations.push({
        type: "info",
        description: `cleaned up temp test directory: ${tempDir}`,
      })
    }
  },
})

export { expect }

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
