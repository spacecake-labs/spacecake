/* eslint-disable no-empty-pattern */

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
  test("open electron app", async ({ electronApp }, testInfo) => {
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

  test("open workspace; create file", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
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

    const textbox = window.getByRole("textbox", { name: "filename.txt" });

    await textbox.fill("test.txt");
    await textbox.press("Enter");
    // await window.keyboard.press("Enter");

    // Wait for the create file input to disappear (indicating state reset)
    await expect(textbox).not.toBeVisible();

    // Wait for the new file to appear in the sidebar
    await expect(
      window.getByRole("button", { name: "test.txt" })
    ).toBeVisible();

    // Verify the file was actually created in the filesystem
    const expectedFilePath = path.join(tempTestDir, "test.txt");
    const fileExists = fs.existsSync(expectedFilePath);

    testInfo.annotations.push({
      type: "info",
      description: `File test.txt exists at ${expectedFilePath}: ${fileExists}`,
    });
  });

  test("nested folder structure and recursive expansion", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // Create a nested folder structure in the temp test directory
    const nestedFolderPath = path.join(tempTestDir, "nested-folder");
    fs.mkdirSync(nestedFolderPath, { recursive: true });

    // Create files at root level: folder, file, file
    fs.writeFileSync(
      path.join(tempTestDir, "root-file-1.txt"),
      "root-file-1-content"
    );
    fs.writeFileSync(
      path.join(tempTestDir, "root-file-2.txt"),
      "root-file-2-content"
    );

    // Create files inside the nested folder
    fs.writeFileSync(
      path.join(nestedFolderPath, "nested-file-1.txt"),
      "nested-file-1-content"
    );
    fs.writeFileSync(
      path.join(nestedFolderPath, "nested-file-2.txt"),
      "nested-file-2-content"
    );

    testInfo.annotations.push({
      type: "info",
      description: `Created nested structure: ${tempTestDir}`,
    });

    // wait for the first window to be ready
    const window = await electronApp.firstWindow();

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible();

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load and verify root level items are visible
    await expect(
      window.getByRole("button", { name: "nested-folder" })
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-1.txt" })
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-2.txt" })
    ).toBeVisible();

    // Click on the nested folder to expand it
    await window.getByRole("button", { name: "nested-folder" }).click();

    // Wait for the nested files to appear
    await expect(
      window.getByRole("button", { name: "nested-file-1.txt" })
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "nested-file-2.txt" })
    ).toBeVisible();

    // Verify all items are still visible after expansion
    await expect(
      window.getByRole("button", { name: "nested-folder" })
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-1.txt" })
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-2.txt" })
    ).toBeVisible();

    // Test file content loading by clicking on files
    // Click on root-file-1.txt and verify content loads
    await window.getByRole("button", { name: "root-file-1.txt" }).click();

    // Wait for the editor to load and verify content
    await expect(window.getByText("root-file-1-content")).toBeVisible();

    // Click on root-file-2.txt and verify content loads
    await window.getByRole("button", { name: "root-file-2.txt" }).click();
    await expect(window.getByText("root-file-2-content")).toBeVisible();

    // Click on nested-file-1.txt and verify content loads
    await window.getByRole("button", { name: "nested-file-1.txt" }).click();
    await expect(window.getByText("nested-file-1-content")).toBeVisible();

    // Click on nested-file-2.txt and verify content loads
    await window.getByRole("button", { name: "nested-file-2.txt" }).click();
    await expect(window.getByText("nested-file-2-content")).toBeVisible();

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully verified nested folder expansion with all items present and file content loading",
    });
  });
});
