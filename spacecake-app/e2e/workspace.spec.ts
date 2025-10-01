import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("spacecake app", () => {
  test("open electron app", async ({ electronApp }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // verify the app has a title (spacecake) or is the main window
    const title = await window.title()
    testInfo.annotations.push({
      type: "info",
      description: `window title: ${title}`,
    })

    await expect(
      window.getByRole("button", { name: "open folder" })
    ).toBeVisible()

    // verify that "empty" text doesn't appear when no workspace is selected
    await expect(window.getByText("empty")).not.toBeVisible()
  })

  test("open workspace; create file with button", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // verify the app has a title (spacecake) or is the main window
    const title = await window.title()
    testInfo.annotations.push({
      type: "info",
      description: `window title: ${title}`,
    })

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // wait for the workspace to load (indicated by the create file button appearing)
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify that "empty" text appears when workspace is selected but empty
    await expect(window.getByText("empty")).toBeVisible()

    await window.getByRole("button", { name: "create file or folder" }).click()

    // Click on "new file" option in the dropdown
    await window.getByRole("menuitem", { name: "new file" }).click()

    const textbox = window.getByRole("textbox", { name: "filename.txt" })

    await textbox.fill("test.txt")

    await textbox.press("Enter", { delay: 100 }) // Added delay

    // Wait for the new file to appear in the sidebar
    await expect(
      window.getByRole("button", { name: "test.txt" }).first()
    ).toBeVisible()

    // Wait for the create file input to disappear (indicating state reset)
    await expect(textbox).not.toBeVisible()

    // Verify the file was actually created in the filesystem
    const expectedFilePath = path.join(tempTestDir, "test.txt")
    const fileExists = fs.existsSync(expectedFilePath)

    testInfo.annotations.push({
      type: "info",
      description: `file test.txt exists at ${expectedFilePath}: ${fileExists}`,
    })
  })

  test("open workspace; create file with key command", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // verify the app has a title (spacecake) or is the main window
    const title = await window.title()
    testInfo.annotations.push({
      type: "info",
      description: `window title: ${title}`,
    })

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // wait for the workspace to load (indicated by the create file button appearing)
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify that "empty" text appears when workspace is selected but empty
    await expect(window.getByText("empty")).toBeVisible()

    await window.keyboard.press("ControlOrMeta+n")

    const textbox = window.getByRole("textbox", { name: "filename.txt" })

    await textbox.fill("test.txt")
    await textbox.press("Enter", { delay: 100 }) // Added delay

    // Wait for the new file to appear in the sidebar
    await expect(
      window.getByRole("button", { name: "test.txt" }).first()
    ).toBeVisible()

    // Wait for the create file input to disappear (indicating state reset)
    await expect(textbox).not.toBeVisible()

    // Verify the file was actually created in the filesystem
    const expectedFilePath = path.join(tempTestDir, "test.txt")
    const fileExists = fs.existsSync(expectedFilePath)

    testInfo.annotations.push({
      type: "info",
      description: `File test.txt exists at ${expectedFilePath}: ${fileExists}`,
    })
  })

  test("nested folder structure and recursive expansion", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // Create a nested folder structure in the temp test directory
    const nestedFolderPath = path.join(tempTestDir, "nested-folder")
    fs.mkdirSync(nestedFolderPath, { recursive: true })

    // Create files at root level: folder, file, file
    fs.writeFileSync(
      path.join(tempTestDir, "root-file-1.txt"),
      "root-file-1-content"
    )
    fs.writeFileSync(
      path.join(tempTestDir, "root-file-2.txt"),
      "root-file-2-content"
    )

    // Create files inside the nested folder
    fs.writeFileSync(
      path.join(nestedFolderPath, "nested-file-1.txt"),
      "nested-file-1-content"
    )
    fs.writeFileSync(
      path.join(nestedFolderPath, "nested-file-2.txt"),
      "nested-file-2-content"
    )

    testInfo.annotations.push({
      type: "info",
      description: `Created nested structure: ${tempTestDir}`,
    })

    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // wait for the workspace to load
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify that the nested folder structure is visible
    await expect(
      window.getByRole("button", { name: "nested-folder" }).first()
    ).toBeVisible()

    // click on the nested folder to expand it
    await window.getByRole("button", { name: "nested-folder" }).first().click()

    // verify that the nested files are visible
    await expect(
      window.getByRole("button", { name: "nested-file-1.txt" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "nested-file-2.txt" }).first()
    ).toBeVisible()
  })

  test("auto-expand and refresh when creating files and folders", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // Create a test folder
    const testFolderPath = path.join(tempTestDir, "test-folder")
    fs.mkdirSync(testFolderPath, { recursive: true })

    testInfo.annotations.push({
      type: "info",
      description: `Created test folder: ${testFolderPath}`,
    })

    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify that the test folder is visible
    await expect(
      window.getByRole("button", { name: "test-folder" }).first()
    ).toBeVisible()

    // Test 1: Create a file inside the folder (should auto-expand)
    await window.getByTestId("more-options-test-folder").click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    // Verify the folder auto-expanded and input field is visible
    await expect(
      window.getByRole("textbox", { name: "filename.txt" })
    ).toBeVisible()

    // Create the file
    const fileInput = window.getByRole("textbox", { name: "filename.txt" })
    await fileInput.fill("test-file.txt")
    await fileInput.press("Enter", { delay: 100 }) // Added delay

    // Verify the file was created and is visible
    await expect(
      window.getByRole("button", { name: "test-file.txt" })
    ).toBeVisible()

    // Test 2: Create a folder inside the folder (should auto-expand)
    // Ensure the test-folder is expanded before trying to create a folder inside it
    await window.getByRole("button", { name: "test-folder" }).first().click()

    await window.getByTestId("more-options-test-folder").click()
    await window.getByRole("menuitem", { name: "new folder" }).click()

    // Verify the folder auto-expanded and input field is visible
    await expect(
      window.getByRole("textbox", { name: "folder name" })
    ).toBeVisible()

    // Create the folder
    const folderInput = window.getByRole("textbox", { name: "folder name" })
    await folderInput.fill("test-subfolder")
    await folderInput.press("Enter", { delay: 100 }) // Added delay

    // Wait for the new folder to appear
    await expect(
      window.getByRole("button", { name: "test-subfolder" })
    ).toBeVisible()

    // Verify both new items are visible in the expanded folder
    await expect(
      window.getByRole("button", { name: "test-file.txt" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "test-subfolder" }).first()
    ).toBeVisible()
  })

  test("create multiple items in nested folders without collapse/expand", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // Create a nested folder structure
    const parentFolderPath = path.join(tempTestDir, "parent-folder")
    const childFolderPath = path.join(parentFolderPath, "child-folder")
    fs.mkdirSync(childFolderPath, { recursive: true })

    testInfo.annotations.push({
      type: "info",
      description: `Created nested structure: ${tempTestDir}`,
    })

    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // wait for the workspace to load
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify that the parent folder is visible
    await expect(
      window.getByRole("button", { name: "parent-folder" }).first()
    ).toBeVisible()

    // Test 1: Create a file in the parent folder
    await window.getByTestId("more-options-parent-folder").click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const fileInput1 = window.getByRole("textbox", { name: "filename.txt" })
    await fileInput1.fill("parent-file.txt")
    await fileInput1.press("Enter", { delay: 100 }) // Added delay

    // Verify the file appears immediately
    await expect(
      window.getByRole("button", { name: "parent-file.txt" })
    ).toBeVisible()

    // Test 2: Create a folder in the parent folder
    await window.getByTestId("more-options-parent-folder").click()
    await window.getByRole("menuitem", { name: "new folder" }).click()

    const folderInput1 = window.getByRole("textbox", {
      name: "folder name",
    })
    await folderInput1.fill("new-child-folder")
    await folderInput1.press("Enter", { delay: 100 }) // Added delay

    // Verify the new folder appears immediately
    await expect(
      window.getByRole("button", { name: "new-child-folder" }).first()
    ).toBeVisible()

    // Test 3: Create a file in the existing child folder
    await window.getByTestId("more-options-child-folder").click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const fileInput2 = window.getByRole("textbox", { name: "filename.txt" })
    await fileInput2.fill("child-file.txt")
    await fileInput2.press("Enter", { delay: 100 }) // Added delay

    // Verify the file appears immediately in the child folder
    await expect(
      window.getByRole("button", { name: "child-file.txt" })
    ).toBeVisible()

    // Test 4: Create another folder in the child folder
    await window.getByTestId("more-options-child-folder").click()
    await window.getByRole("menuitem", { name: "new folder" }).click()

    const folderInput2 = window.getByRole("textbox", {
      name: "folder name",
    })
    await folderInput2.fill("grandchild-folder")
    await folderInput2.press("Enter", { delay: 100 }) // Added delay

    // Verify the grandchild folder appears immediately
    await expect(
      window.getByRole("button", { name: "grandchild-folder" }).first()
    ).toBeVisible()

    // Final verification: All items should be visible without any collapse/expand
    await expect(
      window.getByRole("button", { name: "parent-file.txt" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "new-child-folder" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "child-file.txt" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "grandchild-folder" }).first()
    ).toBeVisible()

    // Verify all files were actually created in the filesystem
    expect(fs.existsSync(path.join(parentFolderPath, "parent-file.txt"))).toBe(
      true
    )
    expect(fs.existsSync(path.join(parentFolderPath, "new-child-folder"))).toBe(
      true
    )
    expect(fs.existsSync(path.join(childFolderPath, "child-file.txt"))).toBe(
      true
    )
    expect(fs.existsSync(path.join(childFolderPath, "grandchild-folder"))).toBe(
      true
    )

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully created multiple nested items without requiring collapse/expand cycles",
    })
  })

  test("delete file", async ({ electronApp, tempTestDir }, testInfo) => {
    // wait for the first window to be ready
    const window = await electronApp.firstWindow()

    // verify the window is visible by checking if it has content
    await expect(window.locator("body")).toBeVisible()

    // Create test files and folders to delete
    const testFilePath = path.join(tempTestDir, "file-to-delete.txt")
    fs.writeFileSync(testFilePath, "test content")

    const emptyFolderPath = path.join(tempTestDir, "empty-folder")
    fs.mkdirSync(emptyFolderPath)

    const folderWithFilesPath = path.join(tempTestDir, "folder-with-files")
    fs.mkdirSync(folderWithFilesPath)

    // Create some files inside the folder
    const file1Path = path.join(folderWithFilesPath, "file1.txt")
    const file2Path = path.join(folderWithFilesPath, "file2.txt")
    const subfolderPath = path.join(folderWithFilesPath, "subfolder")
    const subfilePath = path.join(subfolderPath, "subfile.txt")

    fs.writeFileSync(file1Path, "content 1")
    fs.writeFileSync(file2Path, "content 2")
    fs.mkdirSync(subfolderPath)
    fs.writeFileSync(subfilePath, "sub content")

    // stub the showOpenDialog to return our temp test directory
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // wait for the workspace to load (indicated by the create file button appearing)
    await expect(
      window.getByRole("button", { name: "create file" })
    ).toBeVisible()

    // Wait for all items to appear
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "empty-folder" }).first()
    ).toBeVisible()
    await expect(
      window.getByRole("button", { name: "folder-with-files" }).first()
    ).toBeVisible()

    // Test delete functionality
    await window
      .getByRole("button", { name: "file-to-delete.txt" })
      .first()
      .hover()
    await window.getByTestId("more-options-file-to-delete.txt").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // Verify delete confirmation dialog appears
    await expect(
      window.getByRole("dialog", { name: "delete file" })
    ).toBeVisible()
    await expect(
      window.getByText("are you sure you want to delete 'file-to-delete.txt'?")
    ).toBeVisible()

    // Cancel the delete
    await window.getByRole("button", { name: "cancel" }).click()
    await expect(
      window.getByRole("dialog", { name: "delete file" })
    ).not.toBeVisible()

    // Verify the file is still there
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" }).first()
    ).toBeVisible()

    // Now actually delete the file
    await window
      .getByRole("button", { name: "file-to-delete.txt" })
      .first()
      .hover()
    await window.getByTestId("more-options-file-to-delete.txt").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click()

    // Verify the file is removed from the UI
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" })
    ).not.toBeVisible()

    // Verify the file was actually deleted from the filesystem
    expect(fs.existsSync(testFilePath)).toBe(false)

    // Test deleting an empty folder
    await window.getByRole("button", { name: "empty-folder" }).first().hover()
    await window.getByTestId("more-options-empty-folder").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // Verify delete confirmation dialog appears with folder message
    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).toBeVisible()
    await expect(
      window.getByText(
        "are you sure you want to delete 'empty-folder' and its contents?"
      )
    ).toBeVisible()

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click()

    // Verify the folder is removed from the UI
    await expect(
      window.getByRole("button", { name: "empty-folder" })
    ).not.toBeVisible()

    // Verify the folder was actually deleted from the filesystem
    expect(fs.existsSync(emptyFolderPath)).toBe(false)

    // Test deleting a folder with files (recursive delete)
    await window
      .getByRole("button", { name: "folder-with-files" })
      .first()
      .hover()
    await window.getByTestId("more-options-folder-with-files").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // Verify delete confirmation dialog appears with folder message
    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).toBeVisible()
    await expect(
      window.getByText(
        "are you sure you want to delete 'folder-with-files' and its contents?"
      )
    ).toBeVisible()

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click()

    // Verify the folder is removed from the UI
    await expect(
      window.getByRole("button", { name: "folder-with-files" })
    ).not.toBeVisible()

    // Verify the folder and all its contents were actually deleted from the filesystem
    expect(fs.existsSync(folderWithFilesPath)).toBe(false)
    expect(fs.existsSync(file1Path)).toBe(false)
    expect(fs.existsSync(file2Path)).toBe(false)
    expect(fs.existsSync(subfolderPath)).toBe(false)
    expect(fs.existsSync(subfilePath)).toBe(false)

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully completed delete functionality tests including folder deletion",
    })
  })

  test("previously opened workspace reopens on launch", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create a file in the temp dir
    const testFilePath = path.join(tempTestDir, "persistent-file.txt")
    fs.writeFileSync(testFilePath, "hello persistence")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace for the first time
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()

    // 3. Verify workspace is loaded
    await expect(
      window.getByRole("button", { name: "persistent-file.txt" })
    ).toBeVisible()

    // 4. Reload the window
    // At some point we should improve this test
    // to simulate a proper restart
    await window.reload()

    // 5. Verify the same workspace is automatically reopened
    await expect(
      window.getByRole("button", { name: "persistent-file.txt" })
    ).toBeVisible()

    // Also verify the "open folder" button is not there, since a workspace is open
    await expect(
      window.getByRole("button", { name: "open folder" })
    ).not.toBeVisible()
  })

  test("previously opened file reopens on launch", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create a file in the temp dir
    const testFilePath = path.join(tempTestDir, "persistent-file.md")
    fs.writeFileSync(testFilePath, "hello persistence")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace for the first time
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()

    // 3. Verify workspace is loaded
    await window.getByRole("button", { name: "persistent-file.md" }).click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await expect(window.getByText("hello persistence")).toBeVisible()

    // 4. Reload the window
    // At some point we should improve this test
    // to simulate a proper restart
    await window.reload()

    // 5. Verify the same file is automatically reopened
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await expect(window.getByText("hello persistence")).toBeVisible()
  })

  test("autofocus and type in new file", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // 1. Setup: Create a test file in the temp dir
    const testFilePath = path.join(tempTestDir, "existing-file.txt")
    fs.writeFileSync(testFilePath, "existing content")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()

    // 3. Wait for workspace to load
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // 4. Create a new markdown file using keyboard shortcut
    await window.keyboard.press("ControlOrMeta+n")

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await textbox.fill("test-autofocus.md")
    await textbox.press("Enter", { delay: 100 })

    // 5. Wait for the new file to appear in sidebar and be opened
    await expect(
      window.getByRole("button", { name: "test-autofocus.md" })
    ).toBeVisible()

    // 6. Verify the file is open by checking the file path in toolbar
    await expect(window.getByTestId("current-file-path")).toBeVisible()
    await expect(
      window.getByTestId("current-file-path").getByText("test-autofocus.md")
    ).toBeVisible()

    // 7. Verify the editor is focused and ready for typing
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 8. Type some text - this will only work if autofocus is working!
    await window.keyboard.type("Hello, autofocus!", { delay: 100 })

    // 9. Verify the text was typed into the editor (not just the sidebar)
    // We'll look for the text in a paragraph element within the editor
    await expect(
      window.getByTestId("lexical-editor").getByRole("paragraph")
    ).toContainText("Hello, autofocus!")

    await window.keyboard.press("ControlOrMeta+s", { delay: 100 })

    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(
      window.getByTestId("lexical-editor").getByRole("paragraph")
    ).toContainText("Hello, autofocus!")

    // 10. Verify the file was actually created in the filesystem
    const expectedFilePath = path.join(tempTestDir, "test-autofocus.md")
    const fileExists = fs.existsSync(expectedFilePath)
    expect(fileExists).toBe(true)

    // 11. Verify the content was saved to the file
    const fileContent = fs.readFileSync(expectedFilePath, "utf-8")
    expect(fileContent).toContain("Hello, autofocus!")

    testInfo.annotations.push({
      type: "info",
      description: `autofocus test completed. file created at ${expectedFilePath} with content: ${fileContent}`,
    })
  })
})
