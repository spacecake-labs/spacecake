import {
  test as base,
  expect,
  _electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

export type TestFixtures = {
  electronApp: ElectronApplication;
  tempTestDir: string;
};

export const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  tempTestDir: async ({}, use, testInfo) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-e2e-"));
    testInfo.annotations.push({
      type: "info",
      description: `created temp test directory: ${tempDir}`,
    });

    await use(tempDir);

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      testInfo.annotations.push({
        type: "info",
        description: `cleaned up temp test directory: ${tempDir}`,
      });
    }
  },

  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: [".vite/build/main.js"],
      cwd: process.cwd(),
      timeout: 60000,
      env: { ...process.env, IS_PLAYWRIGHT: "1" },
    });

    await use(app);

    await app.close();
  },
});

export { expect };

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
  const content = fs.readFileSync(absoluteFilePath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // handle python docstring first/last lines now rendered without triple quotes
    const strippedTripleQuotes = trimmed
      .replace(/^r?"""/, "")
      .replace(/"""$/, "")
      .trim();

    if (trimmed.startsWith('"""') || trimmed.startsWith('r"""')) {
      await expect(page.getByText(strippedTripleQuotes).first()).toBeVisible();
    } else if (trimmed.endsWith('"""')) {
      // closing triple quote line in fixture; content likely on previous line, so skip
      continue;
    } else {
      await expect(page.getByText(trimmed).first()).toBeVisible();
    }
  }
}
