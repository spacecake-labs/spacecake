import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import {
  locateQuickOpenInput,
  locateQuickOpenList,
  locateSidebarItem,
  pressQuickOpen,
} from "@/../e2e/utils"
import { stubDialog } from "electron-playwright-helpers"

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

    // Wait for initial home folder load to complete
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 2. Wait for workspace to load
    await waitForWorkspace(window)
    await expect(locateSidebarItem(window, "core.py")).toBeVisible()

    // 3. Open a few files to make them "recent"
    await locateSidebarItem(window, "core.py").click({ delay: 200 })
    await expect(
      window.getByRole("heading", { name: "A file to test block parsing." })
    ).toBeVisible()

    await locateSidebarItem(window, "_README.md").click({ delay: 200 })
    await expect(window.getByText("An Example README File")).toBeVisible()

    await locateSidebarItem(window, "google-doc.py").click({ delay: 200 })

    await expect(
      window.getByRole("heading", { name: "A one-line summary of the module" })
    ).toBeVisible()

    await window.waitForTimeout(1000)

    // 4. Open Quick Open and check for recent files
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFiles = locateQuickOpenList(window)

    expect(await recentFiles.first().textContent()).toContain("google-doc.py")
    expect(await recentFiles.nth(1).textContent()).toContain("_README.md")
    expect(await recentFiles.nth(2).textContent()).toContain("core.py")

    // 5. Test persistence by reloading the page
    await window.reload()

    // workspace should automatically reopen
    await expect(locateSidebarItem(window, "core.py")).toBeVisible()

    // 6. Re-open Quick Open and verify recent files are still there
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const presistedFiles = locateQuickOpenList(window)

    expect(await presistedFiles.first().textContent()).toContain(
      "google-doc.py"
    )
    expect(await presistedFiles.nth(1).textContent()).toContain("_README.md")
    expect(await presistedFiles.nth(2).textContent()).toContain("core.py")
  })

  test("recent files updates with file creation and deletion; persists after reload", async ({
    electronApp,
  }) => {
    const window = await electronApp.firstWindow()

    // 1. Wait for workspace to load
    await waitForWorkspace(window)

    // 2. Open Quick Open and verify recent files list has getting-started.md (auto-opened)
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFiles = locateQuickOpenList(window)
    await expect(recentFiles).toHaveCount(1)
    expect(await recentFiles.first().textContent()).toContain(
      "getting-started.md"
    )

    // 3. Close Quick Open
    await quickOpenInput.press("Escape")

    // 4. Create a file using keyboard command
    await window.keyboard.press("ControlOrMeta+n")

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await textbox.fill("test-recent-file.txt")
    await textbox.press("Enter", { delay: 100 })

    // 6. Wait for the new file to appear in the sidebar
    await expect(
      locateSidebarItem(window, "test-recent-file.txt")
    ).toBeVisible()

    // 7. Open the file to make it "recent"
    await locateSidebarItem(window, "test-recent-file.txt").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 7. Open Quick Open and verify the file appears in recent files
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterCreate = locateQuickOpenList(window)
    await expect(recentFilesAfterCreate).toHaveCount(2)
    expect(await recentFilesAfterCreate.first().textContent()).toContain(
      "test-recent-file.txt"
    )

    // 9. Close Quick Open
    await quickOpenInput.press("Escape")

    await window.waitForTimeout(1000)

    // 10. Reload the window
    await window.reload()

    // 11. Verify workspace reopens
    await expect(
      locateSidebarItem(window, "test-recent-file.txt")
    ).toBeVisible()

    // 12. Open Quick Open and verify recent file persists after reload
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterReload = locateQuickOpenList(window)
    await expect(recentFilesAfterReload).toHaveCount(2)
    expect(await recentFilesAfterReload.first().textContent()).toContain(
      "test-recent-file.txt"
    )

    // 13. Close Quick Open
    await quickOpenInput.press("Escape")

    // 14. Delete the file
    await locateSidebarItem(window, "test-recent-file.txt").hover()
    await window.getByTestId("more-options-test-recent-file.txt").click()
    await window.getByRole("menuitem", { name: "delete" }).click()

    // 15. Confirm the delete
    await window.getByRole("button", { name: "delete" }).click()

    // 16. Verify the file is removed from the UI
    await expect(
      locateSidebarItem(window, "test-recent-file.txt")
    ).not.toBeVisible()

    // 17. Open Quick Open and verify recent files list only has getting-started.md
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterDelete = locateQuickOpenList(window)
    await expect(recentFilesAfterDelete).toHaveCount(1)
    expect(await recentFilesAfterDelete.first().textContent()).toContain(
      "getting-started.md"
    )

    // 18. Close Quick Open
    await quickOpenInput.press("Escape")

    // 19. Reload the window again
    await window.reload()

    // 20. Verify workspace reopens
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // 21. Open Quick Open and verify recent files list still has getting-started.md
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesAfterFinalReload = locateQuickOpenList(window)
    await expect(recentFilesAfterFinalReload).toHaveCount(1)
    expect(await recentFilesAfterFinalReload.first().textContent()).toContain(
      "getting-started.md"
    )
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

    // Wait for initial home folder load to complete before navigating
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 3. Open first workspace using keyboard shortcut
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [workspace1Path],
      canceled: false,
    })
    await window.keyboard.press("ControlOrMeta+o")
    await expect(locateSidebarItem(window, "core.py")).toBeVisible()

    // 4. Open a file in workspace1 to make it "recent"
    await locateSidebarItem(window, "core.py").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 5. Check recent files in workspace1
    await pressQuickOpen(window)
    const quickOpenInput = locateQuickOpenInput(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace1 = locateQuickOpenList(window)

    await expect(recentFilesWorkspace1).toHaveCount(1)
    expect(await recentFilesWorkspace1.first().textContent()).toContain(
      "core.py"
    )

    // 6. Close Quick Open
    await quickOpenInput.press("Escape")

    // 7. Switch to workspace2
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [workspace2Path],
      canceled: false,
    })
    await window.keyboard.press("ControlOrMeta+o")
    await expect(locateSidebarItem(window, "google-doc.py")).toBeVisible()

    // 8. Check that recent files is empty in workspace2
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace2Empty = locateQuickOpenList(window)
    await expect(recentFilesWorkspace2Empty).toHaveCount(0)

    // 9. Close Quick Open
    await quickOpenInput.press("Escape")

    // 10. Open a file in workspace2 to make it "recent"
    await locateSidebarItem(window, "google-doc.py").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // 11. Check recent files in workspace2 now has the file
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace2 = locateQuickOpenList(window)

    await expect(recentFilesWorkspace2).toHaveCount(1)
    expect(await recentFilesWorkspace2.first().textContent()).toContain(
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

    await expect(locateSidebarItem(window, "core.py")).toBeVisible()

    // 14. Check that recent files in workspace1 still shows the original file
    await pressQuickOpen(window)
    await expect(quickOpenInput).toBeVisible()

    const recentFilesWorkspace1Final = locateQuickOpenList(window)
    await expect(recentFilesWorkspace1Final).toHaveCount(1)
    expect(await recentFilesWorkspace1Final.first().textContent()).toContain(
      "core.py"
    )

    // 15. Verify that workspace2's file is NOT in workspace1's recent files
    const allRecentFiles = await recentFilesWorkspace1Final.all()
    const fileNames = await Promise.all(
      allRecentFiles.map((file) => file.textContent())
    )
    // Check that no recent file contains "google-doc.py" in its name
    expect(fileNames.some((name) => name?.includes("google-doc.py"))).toBe(
      false
    )
  })
})
