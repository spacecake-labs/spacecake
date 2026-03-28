import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("quick open feature", () => {
  test("quick open searches and navigates to a nested file", async ({
    electronApp,
    tempTestDir,
  }) => {
    // set up a nested file tree
    const fixtureCorePy = path.join(process.cwd(), "tests", "fixtures", "core.py")
    const nestedDir = path.join(tempTestDir, "level1", "level2")
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.copyFileSync(fixtureCorePy, path.join(nestedDir, "core.py"))

    const window = await electronApp.firstWindow()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await waitForWorkspace(window)
    await expect(locateSidebarItem(window, "level1")).toBeVisible()

    // open quick-open, search, select, and verify content loads
    await window.keyboard.press("ControlOrMeta+p")

    const quickOpenInput = window.getByRole("dialog", { name: "quick open" }).locator("div").nth(1)
    await expect(quickOpenInput).toBeVisible()
    await quickOpenInput.pressSequentially("core.py", { delay: 100 })

    const quickOpenDialog = window.getByRole("dialog", { name: "quick open" })
    await expect(quickOpenDialog.getByRole("option").first()).toBeVisible()
    await window.keyboard.press("Enter")
    await expect(quickOpenInput).not.toBeVisible()

    await expect(
      window.getByRole("heading", { name: "A file to test block parsing." }),
    ).toBeVisible()
  })
})
