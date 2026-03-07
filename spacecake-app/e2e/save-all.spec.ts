import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { clickMenuItem, locateSidebarItem, locateTab } from "@/../e2e/utils"

test.describe("save all", () => {
  test("saves all dirty files via keyboard shortcut", async ({ electronApp, tempTestDir }) => {
    // create test files
    const file1Path = path.join(tempTestDir, "file1.md")
    const file2Path = path.join(tempTestDir, "file2.md")
    const file3Path = path.join(tempTestDir, "file3.md")
    fs.writeFileSync(file1Path, "# file one")
    fs.writeFileSync(file2Path, "# file two")
    fs.writeFileSync(file3Path, "# file three")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // open all 3 files
    await locateSidebarItem(window, "file1.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("file one")).toBeVisible()

    await locateSidebarItem(window, "file2.md").click()
    await expect(window.getByText("file two")).toBeVisible()

    await locateSidebarItem(window, "file3.md").click()
    await expect(window.getByText("file three")).toBeVisible()

    // edit file3 (currently active)
    await window.getByText("file three").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" SAVED3", { delay: 50 })
    await expect(window.getByText("SAVED3")).toBeVisible()
    await expect(window.getByTitle("file3.md (dirty)")).toBeVisible()

    // switch to file1 and edit it
    // (file3 unmounts → flushes state to PGlite)
    await locateTab(window, "file1.md").click()
    await expect(window.getByText("file one")).toBeVisible()
    await window.getByText("file one").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" SAVED1", { delay: 50 })
    await expect(window.getByText("SAVED1")).toBeVisible()
    await expect(window.getByTitle("file1.md (dirty)")).toBeVisible()

    // switch to file2 and edit it (this will be active when we save all)
    // (file1 unmounts → flushes state to PGlite)
    await locateTab(window, "file2.md").click()
    await expect(window.getByText("file two")).toBeVisible()
    await window.getByText("file two").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" SAVED2", { delay: 50 })
    await expect(window.getByText("SAVED2")).toBeVisible()
    await expect(window.getByTitle("file2.md (dirty)")).toBeVisible()

    // wait for PGlite IPC writes to complete (debounce 250ms + IPC round-trip)
    await window.waitForTimeout(1000)

    // trigger save all via keyboard shortcut
    await window.keyboard.press("ControlOrMeta+Shift+S")

    // all tabs should become clean
    await expect(window.getByTitle("file1.md (clean)")).toBeVisible({ timeout: 5000 })
    await expect(window.getByTitle("file2.md (clean)")).toBeVisible({ timeout: 5000 })
    await expect(window.getByTitle("file3.md (clean)")).toBeVisible({ timeout: 5000 })

    // verify files on disk contain the edits (poll to account for async FS writes)
    await expect
      .poll(() => fs.readFileSync(file1Path, "utf-8"), { timeout: 5000 })
      .toContain("SAVED1")
    await expect
      .poll(() => fs.readFileSync(file2Path, "utf-8"), { timeout: 5000 })
      .toContain("SAVED2")
    await expect
      .poll(() => fs.readFileSync(file3Path, "utf-8"), { timeout: 5000 })
      .toContain("SAVED3")
  })

  test("saves all dirty files via menu item", async ({ electronApp, tempTestDir }) => {
    // create test files
    const file1Path = path.join(tempTestDir, "menu-file1.md")
    const file2Path = path.join(tempTestDir, "menu-file2.md")
    fs.writeFileSync(file1Path, "# menu one")
    fs.writeFileSync(file2Path, "# menu two")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // open and edit file1
    await locateSidebarItem(window, "menu-file1.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("menu one")).toBeVisible()
    await window.getByText("menu one").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" MENU1", { delay: 50 })
    await expect(window.getByText("MENU1")).toBeVisible()
    await expect(window.getByTitle("menu-file1.md (dirty)")).toBeVisible()

    // open and edit file2 (becomes active)
    // (file1 unmounts → flushes state to PGlite)
    await locateSidebarItem(window, "menu-file2.md").click()
    await expect(window.getByText("menu two")).toBeVisible()
    await window.getByText("menu two").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" MENU2", { delay: 50 })
    await expect(window.getByText("MENU2")).toBeVisible()
    await expect(window.getByTitle("menu-file2.md (dirty)")).toBeVisible()

    // wait for PGlite IPC writes to complete (debounce 250ms + IPC round-trip)
    await window.waitForTimeout(1000)

    // trigger save all via menu
    await clickMenuItem(electronApp, "File", "Save All")

    // all tabs should become clean
    await expect(window.getByTitle("menu-file1.md (clean)")).toBeVisible({ timeout: 5000 })
    await expect(window.getByTitle("menu-file2.md (clean)")).toBeVisible({ timeout: 5000 })

    // verify files on disk (poll to account for async FS writes)
    await expect
      .poll(() => fs.readFileSync(file1Path, "utf-8"), { timeout: 5000 })
      .toContain("MENU1")
    await expect
      .poll(() => fs.readFileSync(file2Path, "utf-8"), { timeout: 5000 })
      .toContain("MENU2")
  })
})
