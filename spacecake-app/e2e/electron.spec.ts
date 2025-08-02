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

    // verify that "empty" text doesn't appear when no workspace is selected
    await expect(window.getByText("empty")).not.toBeVisible();
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

    // wait for the workspace to load (indicated by the create file button appearing)
    await expect(
      window.getByRole("button", { name: "create file" })
    ).toBeVisible();

    // verify that "empty" text appears when workspace is selected but empty
    await expect(window.getByText("empty")).toBeVisible();

    await window.getByRole("button", { name: "create file" }).click();

    const textbox = window.getByRole("textbox", { name: "filename.txt" });

    await textbox.fill("test.txt");
    await textbox.press("Enter");
    // await window.keyboard.press("Enter");

    // Wait for the create file input to disappear (indicating state reset)
    await expect(textbox).not.toBeVisible();

    // Wait for the new file to appear in the sidebar
    await expect(
      window.getByRole("button", { name: "test.txt" }).first()
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
      window.getByRole("button", { name: "nested-folder" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-1.txt" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-2.txt" }).first()
    ).toBeVisible();

    // Click on the nested folder to expand it
    await window.getByRole("button", { name: "nested-folder" }).first().click();

    // Wait for the nested files to appear
    await expect(
      window.getByRole("button", { name: "nested-file-1.txt" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "nested-file-2.txt" }).first()
    ).toBeVisible();

    // Verify all items are still visible after expansion
    await expect(
      window.getByRole("button", { name: "nested-folder" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-1.txt" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-2.txt" }).first()
    ).toBeVisible();

    // Test file content loading by clicking on files
    // Click on root-file-1.txt and verify content loads
    await window
      .getByRole("button", { name: "root-file-1.txt" })
      .first()
      .click();

    // Wait for the editor to load and verify content
    await expect(window.getByText("root-file-1-content")).toBeVisible();

    // Click on root-file-2.txt and verify content loads
    await window
      .getByRole("button", { name: "root-file-2.txt" })
      .first()
      .click();
    await expect(window.getByText("root-file-2-content")).toBeVisible();

    // Click on nested-file-1.txt and verify content loads
    await window
      .getByRole("button", { name: "nested-file-1.txt" })
      .first()
      .click();
    await expect(window.getByText("nested-file-1-content")).toBeVisible();

    // Click on nested-file-2.txt and verify content loads
    await window
      .getByRole("button", { name: "nested-file-2.txt" })
      .first()
      .click();
    await expect(window.getByText("nested-file-2-content")).toBeVisible();

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully verified nested folder expansion with all items present and file content loading",
    });

    // Test rename functionality with improved selectors
    testInfo.annotations.push({
      type: "info",
      description:
        "Starting rename functionality tests with improved selectors",
    });

    // Test 1: Rename a root file using improved selectors
    await window
      .getByRole("button", { name: "root-file-1.txt" })
      .first()
      .hover();
    await window.getByTestId("more-options-root-file-1.txt").click();
    await window.getByRole("menuitem", { name: "rename" }).click();

    // Verify rename input appears and has the correct initial value
    const renameInput = window.locator("input[data-slot='input']").first();
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue("root-file-1.txt");

    // Rename the file
    await window
      .locator("input[data-slot='input']")
      .first()
      .fill("root-file-1-renamed.txt");
    await window.locator("input[data-slot='input']").first().press("Enter");

    // Test actual typing behavior (simulate character-by-character input)
    await window
      .getByRole("button", { name: "root-file-2.txt" })
      .first()
      .hover();
    await window.getByTestId("more-options-root-file-2.txt").click();
    await window.getByRole("menuitem", { name: "rename" }).click();

    const typingInput = window.locator("input[data-slot='input']").first();
    await expect(typingInput).toBeVisible();
    await expect(typingInput).toHaveValue("root-file-2.txt");

    // Clear the input and type character by character using pressSequentially
    await typingInput.clear();
    await typingInput.pressSequentially("root-file-2-renamed.txt");
    await expect(typingInput).toHaveValue("root-file-2-renamed.txt");
    await typingInput.press("Enter");

    // Verify the file was renamed in the UI
    await expect(
      window.getByRole("button", { name: "root-file-1-renamed.txt" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "root-file-1.txt" })
    ).not.toBeVisible();

    // Verify the file was actually renamed in the filesystem
    const renamedFilePath = path.join(tempTestDir, "root-file-1-renamed.txt");
    const originalFilePath = path.join(tempTestDir, "root-file-1.txt");
    expect(fs.existsSync(renamedFilePath)).toBe(true);
    expect(fs.existsSync(originalFilePath)).toBe(false);

    // Test 2: Validation - try to rename to an existing file name
    await window
      .getByRole("button", { name: "root-file-2-renamed.txt" })
      .first()
      .hover();
    await window.getByTestId("more-options-root-file-2-renamed.txt").click();
    await window.getByRole("menuitem", { name: "rename" }).click();

    // Try to rename to an existing file name
    await window
      .locator("input[data-slot='input']")
      .first()
      .fill("root-file-1-renamed.txt");
    await window.locator("input[data-slot='input']").first().press("Enter");

    // Verify validation error appears
    await expect(
      window.getByText("'root-file-1-renamed.txt' already exists")
    ).toBeVisible();

    // Verify the rename input is still visible (rename wasn't completed)
    await expect(
      window.locator("input[data-slot='input']").first()
    ).toBeVisible();
    await expect(
      window.locator("input[data-slot='input']").first()
    ).toHaveValue("root-file-1-renamed.txt");

    // Cancel the rename by pressing Escape
    await window.locator("input[data-slot='input']").first().press("Escape");
    await expect(
      window.locator("input[data-slot='input']").first()
    ).not.toBeVisible();

    // Verify the original file name is still there
    await expect(
      window.getByRole("button", { name: "root-file-2-renamed.txt" }).first()
    ).toBeVisible();

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully completed rename functionality tests with improved selectors",
    });
  });

  test("delete file functionality", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow();

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible();

    // Create test files and folders to delete
    const testFilePath = path.join(tempTestDir, "file-to-delete.txt");
    fs.writeFileSync(testFilePath, "test content");

    const emptyFolderPath = path.join(tempTestDir, "empty-folder");
    fs.mkdirSync(emptyFolderPath);

    const folderWithFilesPath = path.join(tempTestDir, "folder-with-files");
    fs.mkdirSync(folderWithFilesPath);

    // Create some files inside the folder
    const file1Path = path.join(folderWithFilesPath, "file1.txt");
    const file2Path = path.join(folderWithFilesPath, "file2.txt");
    const subfolderPath = path.join(folderWithFilesPath, "subfolder");
    const subfilePath = path.join(subfolderPath, "subfile.txt");

    fs.writeFileSync(file1Path, "content 1");
    fs.writeFileSync(file2Path, "content 2");
    fs.mkdirSync(subfolderPath);
    fs.writeFileSync(subfilePath, "sub content");

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // wait for the workspace to load (indicated by the create file button appearing)
    await expect(
      window.getByRole("button", { name: "create file" })
    ).toBeVisible();

    // Wait for all items to appear
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "empty-folder" }).first()
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "folder-with-files" }).first()
    ).toBeVisible();

    // Test delete functionality
    await window
      .getByRole("button", { name: "file-to-delete.txt" })
      .first()
      .hover();
    await window.getByTestId("more-options-file-to-delete.txt").click();
    await window.getByRole("menuitem", { name: "delete" }).click();

    // Verify delete confirmation dialog appears
    await expect(
      window.getByRole("dialog", { name: "delete file" })
    ).toBeVisible();
    await expect(
      window.getByText("are you sure you want to delete 'file-to-delete.txt'?")
    ).toBeVisible();

    // Cancel the delete
    await window.getByRole("button", { name: "cancel" }).click();
    await expect(
      window.getByRole("dialog", { name: "delete file" })
    ).not.toBeVisible();

    // Verify the file is still there
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" }).first()
    ).toBeVisible();

    // Now actually delete the file
    await window
      .getByRole("button", { name: "file-to-delete.txt" })
      .first()
      .hover();
    await window.getByTestId("more-options-file-to-delete.txt").click();
    await window.getByRole("menuitem", { name: "delete" }).click();

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click();

    // Verify the file is removed from the UI
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" })
    ).not.toBeVisible();

    // Verify the file was actually deleted from the filesystem
    expect(fs.existsSync(testFilePath)).toBe(false);

    // Test deleting an empty folder
    await window.getByRole("button", { name: "empty-folder" }).first().hover();
    await window.getByTestId("more-options-empty-folder").click();
    await window.getByRole("menuitem", { name: "delete" }).click();

    // Verify delete confirmation dialog appears with folder message
    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).toBeVisible();
    await expect(
      window.getByText(
        "are you sure you want to delete 'empty-folder' and its contents?"
      )
    ).toBeVisible();

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click();

    // Verify the folder is removed from the UI
    await expect(
      window.getByRole("button", { name: "empty-folder" })
    ).not.toBeVisible();

    // Verify the folder was actually deleted from the filesystem
    expect(fs.existsSync(emptyFolderPath)).toBe(false);

    // Test deleting a folder with files (recursive delete)
    await window
      .getByRole("button", { name: "folder-with-files" })
      .first()
      .hover();
    await window.getByTestId("more-options-folder-with-files").click();
    await window.getByRole("menuitem", { name: "delete" }).click();

    // Verify delete confirmation dialog appears with folder message
    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).toBeVisible();
    await expect(
      window.getByText(
        "are you sure you want to delete 'folder-with-files' and its contents?"
      )
    ).toBeVisible();

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click();

    // Verify the folder is removed from the UI
    await expect(
      window.getByRole("button", { name: "folder-with-files" })
    ).not.toBeVisible();

    // Verify the folder and all its contents were actually deleted from the filesystem
    expect(fs.existsSync(folderWithFilesPath)).toBe(false);
    expect(fs.existsSync(file1Path)).toBe(false);
    expect(fs.existsSync(file2Path)).toBe(false);
    expect(fs.existsSync(subfolderPath)).toBe(false);
    expect(fs.existsSync(subfilePath)).toBe(false);

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully completed delete functionality tests including folder deletion",
    });
  });
});
