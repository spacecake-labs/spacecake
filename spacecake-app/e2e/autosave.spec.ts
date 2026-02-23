import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem, locateTab, locateTabCloseButton } from "@/../e2e/utils"

test.describe("autosave", () => {
  test("autosave OFF: file remains dirty after editing", async ({ electronApp, tempTestDir }) => {
    // Create a test file
    const testFilePath = path.join(tempTestDir, "test-autosave-off.md")
    fs.writeFileSync(testFilePath, "# Original content")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // Open the file
    await locateSidebarItem(window, "test-autosave-off.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("Original content")).toBeVisible()

    // Make an edit
    await window.getByText("Original content").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" EDITED", { delay: 50 })

    // Diagnostic: verify the edit actually appeared in the editor
    await expect(window.getByText("EDITED")).toBeVisible({ timeout: 5000 })

    // Verify the file is dirty
    const dirtyRow = window.getByTitle("test-autosave-off.md (dirty)")
    await expect(dirtyRow).toBeVisible()

    // Wait well beyond the autosave debounce time (1 second) - use 2 seconds
    await window.waitForTimeout(2000)

    // Verify file is still dirty (autosave is off by default)
    await expect(dirtyRow).toBeVisible()

    // Verify file on disk is unchanged
    const fileContent = fs.readFileSync(testFilePath, "utf-8")
    expect(fileContent).toBe("# Original content")
    expect(fileContent).not.toContain("EDITED")
  })

  test("autosave ON: debounce save and close-tab save", async ({ electronApp, tempTestDir }) => {
    // Create test files
    const testFilePath = path.join(tempTestDir, "test-autosave-on.md")
    const testFile1Path = path.join(tempTestDir, "file1.md")
    const testFile2Path = path.join(tempTestDir, "file2.md")
    fs.writeFileSync(testFilePath, "# Original content")
    fs.writeFileSync(testFile1Path, "# File 1 content")
    fs.writeFileSync(testFile2Path, "# File 2 content")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // Navigate to settings and enable autosave
    await window.getByRole("button", { name: "settings" }).click()
    await expect(window.getByText("enable autosave")).toBeVisible()

    // Enable the autosave toggle
    const autosaveSwitch = window.locator("#autosave-setting")
    await autosaveSwitch.click()

    // Verify switch is now on
    await expect(autosaveSwitch).toBeChecked()

    // Wait for setting to persist
    await window.waitForTimeout(500)

    // --- Part 1: Test debounce save ---

    // Navigate back to the workspace and open the file
    await locateSidebarItem(window, "test-autosave-on.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("Original content")).toBeVisible()

    // Make an edit
    await window.getByText("Original content").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" AUTOSAVED", { delay: 50 })

    // Verify the file becomes dirty initially
    const dirtyRow = window.getByTitle("test-autosave-on.md (dirty)")
    await expect(dirtyRow).toBeVisible()

    // Wait for autosave (debounce is 1 second, so wait 2 seconds to be safe)
    await window.waitForTimeout(2000)

    // Verify file is now clean
    const cleanRow = window.getByTitle("test-autosave-on.md (clean)")
    await expect(cleanRow).toBeVisible()

    // Verify file on disk has new content
    const fileContent = fs.readFileSync(testFilePath, "utf-8")
    expect(fileContent).toContain("AUTOSAVED")

    // --- Part 2: Test closing tab saves dirty file ---

    // Open both files
    await locateSidebarItem(window, "file1.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("File 1 content")).toBeVisible()

    await locateSidebarItem(window, "file2.md").click()
    await expect(window.getByText("File 2 content")).toBeVisible()

    // Go back to file1 and make an edit
    await locateTab(window, "file1.md").click()
    await expect(window.getByText("File 1 content")).toBeVisible()

    await window.getByText("File 1 content").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" CLOSE-SAVED", { delay: 50 })

    // Verify the file is dirty
    const dirtyRow2 = window.getByTitle("file1.md (dirty)")
    await expect(dirtyRow2).toBeVisible()

    // Close the tab immediately (before autosave debounce)
    await locateTabCloseButton(window, "file1.md").click({ force: true })

    // Tab should be closed
    await expect(locateTab(window, "file1.md")).not.toBeVisible()

    // File should have been saved on close (autosave enabled)
    // Give it a moment for the save to complete
    await window.waitForTimeout(500)

    const file1Content = fs.readFileSync(testFile1Path, "utf-8")
    expect(file1Content).toContain("CLOSE-SAVED")
  })
})
