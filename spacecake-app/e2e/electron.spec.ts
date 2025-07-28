import { test as base, expect } from "@playwright/test";
import { _electron, ElectronApplication } from "@playwright/test";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";
import os from "os";

// Define custom fixtures
type TestFixtures = {
  electronApp: ElectronApplication;
  tempTestDir: string;
};

const test = base.extend<TestFixtures>({
  tempTestDir: async ({}, use, testInfo) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-e2e-"));
    testInfo.annotations.push({
      type: "info",
      description: `created temp test directory: ${tempDir}`,
    });

    await use(tempDir);

    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      testInfo.annotations.push({
        type: "info",
        description: `cleaned up temp test directory: ${tempDir}`,
      });
    }
  },

  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: [".vite/build/main.js"],
      cwd: process.cwd(),
      timeout: 60000,
    });

    await use(app);

    // Cleanup
    await app.close();
  },
});

test.describe("spacecake app", () => {
  test("open electron app", async ({ electronApp, tempTestDir }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow();

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible();

    // verify the app has a title (spacecake) or is the main window
    const title = await window.title();
    testInfo.annotations.push({
      type: "info",
      description: `window title: ${title}`,
    });

    await expect(
      window.getByRole("button", { name: "open folder" })
    ).toBeVisible();
  });

  test("open folder", async ({ electronApp, tempTestDir }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow();

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible();

    // verify the app has a title (spacecake) or is the main window
    const title = await window.title();
    testInfo.annotations.push({
      type: "info",
      description: `window title: ${title}`,
    });

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    await window.getByRole("button", { name: "create file" }).click();

    await expect(
      window.getByRole("textbox", { name: "filename.txt" })
    ).toBeVisible();
  });
});
