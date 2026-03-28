import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "@/../e2e/fixtures"
import {
  locateQuickOpenInput,
  locateQuickOpenList,
  locateSidebarItem,
  pressQuickOpen,
} from "@/../e2e/utils"

test.describe("recent files", () => {
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
      path.join(workspace1Path, "core.py"),
    )

    // Copy different file to workspace2
    fs.copyFileSync(
      path.join(__dirname, "..", "tests", "fixtures", "google-doc.py"),
      path.join(workspace2Path, "google-doc.py"),
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
    expect(await recentFilesWorkspace1.first().textContent()).toContain("core.py")

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
    expect(await recentFilesWorkspace2.first().textContent()).toContain("google-doc.py")

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
    expect(await recentFilesWorkspace1Final.first().textContent()).toContain("core.py")

    // 15. Verify that workspace2's file is NOT in workspace1's recent files
    const allRecentFiles = await recentFilesWorkspace1Final.all()
    const fileNames = await Promise.all(allRecentFiles.map((file) => file.textContent()))
    // Check that no recent file contains "google-doc.py" in its name
    expect(fileNames.some((name) => name?.includes("google-doc.py"))).toBe(false)
  })
})
