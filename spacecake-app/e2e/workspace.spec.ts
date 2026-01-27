import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"

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

    // app auto-opens to home folder (tempTestDir via SPACECAKE_HOME) with getting-started.md
    // verify the workspace loaded (sidebar visible with create file button)
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // verify getting-started.md is open in the editor
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("welcome to spacecake")).toBeVisible()
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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    await window
      .getByRole("menuitem", { name: "delete" })
      .click({ force: true })

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
    await window
      .getByRole("menuitem", { name: "delete" })
      .click({ force: true })
    await expect(
      window.getByText("are you sure you want to delete 'file-to-delete.txt'?")
    ).toBeVisible()

    // Confirm the delete
    await window.getByRole("button", { name: "delete" }).click({ force: true })

    await expect(
      window.getByRole("dialog", { name: "delete file" })
    ).not.toBeVisible()

    // Verify the file is removed from the UI
    await expect(
      window.getByRole("button", { name: "file-to-delete.txt" })
    ).not.toBeVisible()

    // Verify the file was actually deleted from the filesystem
    expect(fs.existsSync(testFilePath)).toBe(false)

    // Test deleting an empty folder
    await window.getByRole("button", { name: "empty-folder" }).first().hover()
    await window.getByTestId("more-options-empty-folder").click()
    await window
      .getByRole("menuitem", { name: "delete" })
      .click({ force: true })

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
    await window.getByRole("button", { name: "delete" }).click({ force: true })

    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).not.toBeVisible()

    // Verify the folder is removed from the UI
    await expect(
      window.getByRole("button", { name: "empty-folder" })
    ).not.toBeVisible()

    // Verify the folder was actually deleted from the filesystem
    expect(fs.existsSync(emptyFolderPath)).toBe(false)

    // Test deleting a folder with files (recursive delete)
    await window.getByTestId("more-options-folder-with-files").click()
    await window
      .getByRole("menuitem", { name: "delete" })
      .click({ force: true })

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
    await window.getByRole("button", { name: "delete" }).click({ force: true })

    await expect(
      window.getByRole("dialog", { name: "delete folder" })
    ).not.toBeVisible()

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
    await waitForWorkspace(window)

    // 3. Verify workspace is loaded
    await expect(
      window.getByRole("button", { name: "persistent-file.txt" })
    ).toBeVisible()

    // wait for workspace to be logged in db
    await window.waitForTimeout(1000)

    // 4. Reload the window
    // At some point we should improve this test
    // to simulate a proper restart
    await window.reload()

    // 5. Verify the same workspace is automatically reopened
    await expect(
      window.getByRole("button", { name: "persistent-file.txt" })
    ).toBeVisible()

    // Verify the workspace loaded (create file button visible means we're in a workspace)
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()
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
    await waitForWorkspace(window)

    // 3. Verify workspace is loaded and open the file
    await window.getByRole("button", { name: "persistent-file.md" }).click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await expect(window.getByText("hello persistence")).toBeVisible()

    await window.waitForTimeout(1000)

    // 4. Reload the window
    // At some point we should improve this test
    // to simulate a proper restart
    await window.reload()

    // 5. Verify the same file is automatically reopened
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await expect(window.getByText("hello persistence")).toBeVisible()
  })

  test("auto-reveal expands folders when opening nested file", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create a 3-level nested structure with a file at the deepest level
    const level1Dir = path.join(tempTestDir, "level1")
    const level2Dir = path.join(level1Dir, "level2")
    const level3Dir = path.join(level2Dir, "level3")

    fs.mkdirSync(level3Dir, { recursive: true })
    const nestedFilePath = path.join(level3Dir, "deep-file.txt")
    fs.writeFileSync(nestedFilePath, "deep file content")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await waitForWorkspace(window)

    // 3. Open the deeply nested folder
    await window
      .getByRole("button", { name: "level1" })
      .locator("svg:first-child") // click the chevron
      .click({ delay: 100 })
    await window
      .getByRole("button", { name: "level2" })
      .locator("svg:first-child") // click the chevron
      .click({ delay: 100 })
    await window
      .getByRole("button", { name: "level3" })
      .locator("svg:first-child")
      .click({ delay: 100 })

    // 4. Open the deeply nested file (click left side to avoid more-options overlay)
    await window
      .getByRole("button", { name: "deep-file.txt" })
      .click({ delay: 100, position: { x: 5, y: 5 } })

    // 5. Verify the file content is visible
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("deep file content")).toBeVisible()

    await window.waitForTimeout(1000)
    // 6. Reload the window

    await window.reload()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await expect(window.getByText("deep file content")).toBeVisible()

    // 7. Verify all parent folders are auto-expanded by checking that the nested structure is visible
    // In the virtualized list, children are only rendered if parents are expanded.
    await expect(window.getByRole("button", { name: "level1" })).toBeVisible()
    await expect(window.getByRole("button", { name: "level2" })).toBeVisible()
    await expect(window.getByRole("button", { name: "level3" })).toBeVisible()
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
    await waitForWorkspace(window)

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

    await window.waitForTimeout(1000)

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

  test("dot files and folders are visible after external creation", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // 1. Setup: Create a dot folder in the temp dir
    const dotFolderPath = path.join(tempTestDir, ".notes")
    fs.mkdirSync(dotFolderPath)

    testInfo.annotations.push({
      type: "info",
      description: `Created dot folder: ${dotFolderPath}`,
    })

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await waitForWorkspace(window)

    // 4. Click on the dot folder to expand it
    await window.getByRole("button", { name: ".notes" }).first().click()

    // 5. Verify that test.md is not visible yet (since it doesn't exist)
    await expect(
      window.getByRole("button", { name: "test.md" })
    ).not.toBeVisible()

    // 6. Create the test.md file in the background using filesystem
    const testFilePath = path.join(dotFolderPath, "test.md")
    fs.writeFileSync(testFilePath, "# test content")

    testInfo.annotations.push({
      type: "info",
      description: `Created test.md file at: ${testFilePath}`,
    })

    // 7. Wait for the file to become visible in the sidebar (file watching should detect it)
    await expect(
      window.getByRole("button", { name: "test.md" }).first()
    ).toBeVisible()

    // 8. Verify the file was actually created in the filesystem
    expect(fs.existsSync(testFilePath)).toBe(true)

    testInfo.annotations.push({
      type: "info",
      description:
        "Successfully verified dot files are visible after external creation",
    })
  })

  test("file dirty state indicator appears on edit and disappears on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create a test file in the temp dir
    const testFilePath = path.join(tempTestDir, "test-dirty.md")
    fs.writeFileSync(testFilePath, "# Initial content")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await waitForWorkspace(window)

    // 3. Click on the file to open it
    await window.getByRole("button", { name: "test-dirty.md" }).click()

    // 4. Verify the editor is visible and has the initial content
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    await expect(editor.getByText("Initial content")).toBeVisible()

    // 5. Type some text to make the file dirty
    await editor.getByText("Initial content").click() // focus editor
    await window.keyboard.type("... some new text", { delay: 100 })

    // 6. Verify the dirty indicator is visible
    const dirtyRow = window.getByTitle("test-dirty.md (dirty)")
    await expect(dirtyRow).toBeVisible()

    // 7. Save the file
    await window.keyboard.press("ControlOrMeta+s", { delay: 100 })

    // 8. Verify the dirty indicator is gone (row title should update to clean)
    await expect(dirtyRow).not.toBeVisible()
    await expect(window.getByTitle("test-dirty.md (clean)")).toBeVisible()

    // 9. (Optional but good) Verify the content was saved
    const fileContent = fs.readFileSync(testFilePath, "utf-8")
    expect(fileContent).toContain("... some new text")
  })

  test("file revert discards changes and restores original content", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create a test file with known content
    const testFilePath = path.join(tempTestDir, "test-revert.md")
    fs.writeFileSync(testFilePath, "# Original content")

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await waitForWorkspace(window)

    // 3. Click on the file to open it
    await window.getByRole("button", { name: "test-revert.md" }).click()

    // 4. Verify the editor is visible and has the initial content
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    await expect(editor.getByText("Original content")).toBeVisible()

    // 5. Type some text to make the file dirty
    await editor.getByText("Original content").click()
    await window.keyboard.press("End") // ensure cursor is at end of line
    await window.keyboard.type(" EDITED", { delay: 50 })

    // 6. Verify the dirty indicator and edited content
    const dirtyRow = window.getByTitle("test-revert.md (dirty)")
    await expect(dirtyRow).toBeVisible()
    await expect(editor.getByText("Original content EDITED")).toBeVisible()

    // 7. Open dropdown and click revert
    await window.getByTestId("more-options-test-revert.md").click()
    await window.getByRole("menuitem", { name: "revert" }).click()

    // 8. Verify revert confirmation dialog appears
    await expect(
      window.getByRole("dialog", { name: "revert file" })
    ).toBeVisible()
    await expect(
      window.getByText("are you sure you want to revert 'test-revert.md'?")
    ).toBeVisible()

    // 9. Cancel the revert - should remain dirty with edited content
    await window.getByRole("button", { name: "cancel" }).click()
    await expect(
      window.getByRole("dialog", { name: "revert file" })
    ).not.toBeVisible()
    await expect(dirtyRow).toBeVisible()
    await expect(editor.getByText("Original content EDITED")).toBeVisible()

    // 10. Open dropdown and click revert again
    await window.getByTestId("more-options-test-revert.md").click()
    await window.getByRole("menuitem", { name: "revert" }).click()

    // 11. Confirm the revert
    await window.getByRole("button", { name: "revert" }).click()

    // 12. Verify file is now clean and content is restored to original
    await expect(dirtyRow).not.toBeVisible()
    await expect(window.getByTitle("test-revert.md (clean)")).toBeVisible()
    await expect(editor.getByText("Original content")).toBeVisible()
    await expect(editor.getByText("Original content EDITED")).not.toBeVisible()
  })
})
