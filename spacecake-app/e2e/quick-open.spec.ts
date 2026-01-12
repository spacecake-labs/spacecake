import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("quick open feature", () => {
  test("quick open and navigate to files", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    // Define source paths for fixture files
    const fixtureReadme = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "_README.md"
    )
    const fixtureCorePy = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "core.py"
    )
    const fixtureGoogleDocPy = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "google-doc.py"
    )

    // Define target paths within tempTestDir
    const targetReadme = path.join(tempTestDir, "README.md")
    const targetLevel1Dir = path.join(tempTestDir, "level1")
    const targetCorePy = path.join(targetLevel1Dir, "core.py")
    const targetLevel2Dir = path.join(targetLevel1Dir, "level2")
    const targetGoogleDocPy = path.join(targetLevel2Dir, "google-doc.py")

    // Populate the temporary workspace
    fs.copyFileSync(fixtureReadme, targetReadme)
    fs.mkdirSync(targetLevel1Dir, { recursive: true })
    fs.copyFileSync(fixtureCorePy, targetCorePy)
    fs.mkdirSync(targetLevel2Dir, { recursive: true })
    fs.copyFileSync(fixtureGoogleDocPy, targetGoogleDocPy)

    testInfo.annotations.push({
      type: "info",
      description: `Populated temp test directory: ${tempTestDir}`,
    })

    // Get the first window
    const window = await electronApp.firstWindow()

    // Verify the window is visible
    await expect(window.locator("body")).toBeVisible()

    // Wait for initial home folder load to complete
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // open the temp test directory as workspace (triggers file tree refresh)
    await waitForWorkspace(window)

    // Wait for the test files to appear in the file tree
    await expect(
      window.getByRole("button", { name: "README.md" })
    ).toBeVisible()

    // --- Test README.md (root level) ---
    // Try using the keyboard shortcut
    await window.keyboard.press("ControlOrMeta+p")

    const quickOpenInput = window
      .getByRole("dialog", { name: "quick open" })
      .locator("div")
      .nth(1)
    await expect(quickOpenInput).toBeVisible()
    await quickOpenInput.pressSequentially("README.md", { delay: 100 })

    await window.keyboard.press("Enter")
    await expect(quickOpenInput).not.toBeVisible() // Quick open should close

    // Check contnts of README.md are visible
    await expect(
      window.getByRole("heading", {
        name: "An Example README File to Test Parsing",
      })
    ).toBeVisible()

    // --- Test core.py (one level nested) ---
    await window.keyboard.press("ControlOrMeta+p")
    await expect(quickOpenInput).toBeVisible()
    await quickOpenInput.pressSequentially("core.py", { delay: 100 })
    await window.keyboard.press("Enter")
    await expect(quickOpenInput).not.toBeVisible() // Quick open should close

    // Check contents of core.py are visible
    await expect(
      window.getByRole("heading", {
        name: "A file to test block parsing.",
      })
    ).toBeVisible()

    // --- Test google-doc.py (two levels nested) ---
    // Click the button this time instead of using the keyboard shortcut
    await window.getByRole("button", { name: "search files" }).click()
    await expect(quickOpenInput).toBeVisible()
    await quickOpenInput.pressSequentially("google-doc.py", { delay: 100 })
    await window.keyboard.press("Enter")
    await expect(quickOpenInput).not.toBeVisible() // Quick open should close

    // Verify content of google-doc.py
    await expect(
      window.getByRole("heading", {
        name: "A one-line summary of the module or program, terminated by a period.",
      })
    ).toBeVisible()
  })
})
