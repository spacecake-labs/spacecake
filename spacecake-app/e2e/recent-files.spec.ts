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
    await expect(window.getByTestId("lexical-editor")).toBeVisible() // wait for editor
    await window.getByRole("button", { name: "_README.md" }).click()
    await expect(window.getByText("An Example README File")).toBeVisible()
    await window.getByRole("button", { name: "google-doc.py" }).click()
    await expect(
      window.getByText("A one-line summary of the module")
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
})
