import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("save all", () => {
  test("saves all dirty files via keyboard shortcut", async ({ electronApp, tempTestDir }) => {
    // create test files
    const file1Path = path.join(tempTestDir, "file1.md")
    const file2Path = path.join(tempTestDir, "file2.md")
    fs.writeFileSync(file1Path, "# file one")
    fs.writeFileSync(file2Path, "# file two")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // open and edit file1
    await locateSidebarItem(window, "file1.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await expect(window.getByText("file one")).toBeVisible()
    await window.getByText("file one").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" SAVED1", { delay: 50 })
    await expect(window.getByTitle("file1.md (dirty)")).toBeVisible()

    // open and edit file2 (becomes active; file1 unmounts → flushes state to PGlite)
    await locateSidebarItem(window, "file2.md").click()
    await expect(window.getByText("file two")).toBeVisible()
    await window.getByText("file two").click()
    await window.keyboard.press("End")
    await window.keyboard.type(" SAVED2", { delay: 50 })
    await expect(window.getByTitle("file2.md (dirty)")).toBeVisible()

    // wait for PGlite IPC writes to complete
    await window.waitForTimeout(1000)

    // trigger save all
    await window.keyboard.press("ControlOrMeta+Shift+S")

    // all tabs should become clean
    await expect(window.getByTitle("file1.md (clean)")).toBeVisible({ timeout: 5000 })
    await expect(window.getByTitle("file2.md (clean)")).toBeVisible({ timeout: 5000 })

    // verify files on disk contain the edits
    await expect
      .poll(() => fs.readFileSync(file1Path, "utf-8"), { timeout: 5000 })
      .toContain("SAVED1")
    await expect
      .poll(() => fs.readFileSync(file2Path, "utf-8"), { timeout: 5000 })
      .toContain("SAVED2")
  })
})
