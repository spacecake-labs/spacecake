import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"
import {
  locateQuickOpenInput,
  locateQuickOpenList,
  pressQuickOpen,
} from "./utils"

test.describe("recent files", () => {
  test("should list recent files and persist them across reloads", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Copy fixture files to temp directory
    const filesToCopy = ["_README.md", "core.py", "google-doc.py"]
    for (const file of filesToCopy) {
      fs.copyFileSync(
        path.join(__dirname, "..", "tests", "fixtures", file),
        path.join(tempTestDir, file)
      )
    }

    const window = await electronApp.firstWindow()

    // 2. Open the workspace
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()
    await expect(window.getByRole("button", { name: "core.py" })).toBeVisible()

    // 3. Open a few files to make them "recent"
    await window.getByRole("button", { name: "core.py" }).click()
    await expect(
      window.getByRole("heading", { name: "A file to test block parsing." })
    ).toBeVisible()

    await window.getByRole("button", { name: "_README.md" }).click()
    await expect(window.getByText("An Example README File")).toBeVisible()

    await window.getByRole("button", { name: "google-doc.py" }).click()

    await expect(
      window.getByText('"""A one-line summary of the module')
    ).toBeVisible()

    // 4. Open Quick Open and check for recent files
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFiles = locateQuickOpenList(window)

    expect(await recentFiles.first().textContent()).toBe("google-doc.py")
    expect(await recentFiles.nth(1).textContent()).toBe("_README.md")
    expect(await recentFiles.nth(2).textContent()).toBe("core.py")

    // 5. Test persistence by reloading the page
    await window.reload()

    // workspace should automatically reopen
    await expect(window.getByRole("button", { name: "core.py" })).toBeVisible()

    // 6. Re-open Quick Open and verify recent files are still there
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const presistedFiles = locateQuickOpenList(window)

    expect(await presistedFiles.first().textContent()).toBe("google-doc.py")
    expect(await presistedFiles.nth(1).textContent()).toBe("_README.md")
    expect(await presistedFiles.nth(2).textContent()).toBe("core.py")
  })

  test("recent files updates with file creation and deletion; persists after reload", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // 1. Open empty workspace
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()

    // 2. Verify workspace is loaded (empty)
    await expect(window.getByText("empty")).toBeVisible()

    // 3. Open Quick Open and verify recent files list is empty
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFiles = locateQuickOpenList(window)
    await expect(recentFiles).toHaveCount(0)

    // 4. Close Quick Open
    await quickOpenInput.press("Escape")

    // 5. Create a file using keyboard command
    await window.keyboard.press("ControlOrMeta+n")

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await textbox.fill("test-recent-file.txt")
    await textbox.press("Enter", { delay: 100 })

    // 6. Wait for the new file to appear in the sidebar
    await expect(
      window.getByRole("button", { name: "test-recent-file.txt" }).first()
    ).toBeVisible()

    // 7. Open the file to make it "recent"
    await window.getByRole("button", { name: "test-recent-file.txt" }).click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 8. Open Quick Open and verify the file appears in recent files
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterCreate = locateQuickOpenList(window)
    await expect(recentFilesAfterCreate).toHaveCount(1)
    expect(await recentFilesAfterCreate.first().textContent()).toBe(
      "test-recent-file.txt"
    )

    // 9. Close Quick Open
    await quickOpenInput.press("Escape")

    // 10. Reload the window
    await window.reload()

    // 11. Verify workspace reopens
    await expect(
      window.getByRole("button", { name: "test-recent-file.txt" })
    ).toBeVisible()

    // 12. Open Quick Open and verify recent file persists after reload
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterReload = locateQuickOpenList(window)
    await expect(recentFilesAfterReload).toHaveCount(1)
    expect(await recentFilesAfterReload.first().textContent()).toBe(
      "test-recent-file.txt"
    )

    // 13. Close Quick Open
    await quickOpenInput.press("Escape")

    // 14. Delete the file
    await window
      .getByRole("button", { name: "test-recent-file.txt" })
      .first()
      .hover()
    await window.getByTestId("more-options-test-recent-file.txt").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // 15. Confirm the delete
    await window.getByRole("button", { name: "delete" }).click()

    // 16. Verify the file is removed from the UI
    await expect(
      window.getByRole("button", { name: "test-recent-file.txt" })
    ).not.toBeVisible()

    // 17. Open Quick Open and verify recent files list is empty again
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterDelete = locateQuickOpenList(window)
    await expect(recentFilesAfterDelete).toHaveCount(0)

    // 18. Close Quick Open
    await quickOpenInput.press("Escape")

    // 19. Reload the window again
    await window.reload()

    // 20. Verify workspace reopens (empty)
    await expect(window.getByText("empty")).toBeVisible()

    // 21. Open Quick Open and verify recent files list is still empty after reload
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterFinalReload = locateQuickOpenList(window)
    await expect(recentFilesAfterFinalReload).toHaveCount(0)
  })

  test("recent files are workspace-specific and persist across workspace switches", async ({
    electronApp,
    tempTestDir,
  }) => {
    // 1. Setup: Create two workspace directories within tempTestDir
    const workspace1Path = path.join(tempTestDir, "workspace1")
    const workspace2Path = path.join(tempTestDir, "workspace2")
    fs.mkdirSync(workspace1Path, { recursive: true })
    fs.mkdirSync(workspace2Path, { recursive: true })

    // 2. Copy fixture files to each workspace
    // Only copy one file to each workspace to keep recent files list simple
    fs.copyFileSync(
      path.join(__dirname, "..", "tests", "fixtures", "core.py"),
      path.join(workspace1Path, "core.py")
    )

    // Copy different file to workspace2
    fs.copyFileSync(
      path.join(__dirname, "..", "tests", "fixtures", "google-doc.py"),
      path.join(workspace2Path, "google-doc.py")
    )

    const window = await electronApp.firstWindow()

    // 3. Open first workspace
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [workspace1Path],
      canceled: false,
    })
    await window.getByRole("button", { name: "open folder" }).click()
    await expect(window.getByRole("button", { name: "core.py" })).toBeVisible()

    // 4. Open a file in workspace1 to make it "recent"
    await window.getByRole("button", { name: "core.py" }).click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 5. Check recent files in workspace1
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace1 = locateQuickOpenList(window)

    await expect(recentFilesWorkspace1).toHaveCount(1)
    expect(await recentFilesWorkspace1.first().textContent()).toBe("core.py")

    // 6. Close Quick Open
    await quickOpenInput.press("Escape")

    // 7. Switch to workspace2
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [workspace2Path],
      canceled: false,
    })
    await window.keyboard.press("ControlOrMeta+o")
    await expect(
      window.getByRole("button", { name: "google-doc.py" })
    ).toBeVisible()

    // 8. Check that recent files is empty in workspace2
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace2Empty = locateQuickOpenList(window)
    await expect(recentFilesWorkspace2Empty).toHaveCount(0)

    // 9. Close Quick Open
    await quickOpenInput.press("Escape")

    // 10. Open a file in workspace2 to make it "recent"
    await window.getByRole("button", { name: "google-doc.py" }).click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 11. Check recent files in workspace2 now has the file
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace2 = locateQuickOpenList(window)

    await expect(recentFilesWorkspace2).toHaveCount(1)
    expect(await recentFilesWorkspace2.first().textContent()).toBe(
      "google-doc.py"
    )

    // 12. Close Quick Open
    await quickOpenInput.press("Escape")

    // 13. Switch back to workspace1
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [workspace1Path],
      canceled: false,
    })
    await window.keyboard.press("ControlOrMeta+o")

    await expect(window.getByRole("button", { name: "core.py" })).toBeVisible()

    // 14. Check that recent files in workspace1 still shows the original file
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace1Final = locateQuickOpenList(window)
    await expect(recentFilesWorkspace1Final).toHaveCount(1)
    expect(await recentFilesWorkspace1Final.first().textContent()).toBe(
      "core.py"
    )

    // 15. Verify that workspace2's file is NOT in workspace1's recent files
    const allRecentFiles = await recentFilesWorkspace1Final.all()
    const fileNames = await Promise.all(
      allRecentFiles.map((file) => file.textContent())
    )
    expect(fileNames).not.toContain("google-doc.py")
  })
})
