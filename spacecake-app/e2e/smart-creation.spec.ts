import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem, locateTabCloseButton } from "@/../e2e/utils"

test.describe("smart file/folder creation", () => {
  test("creates files relative to last-clicked tree item", async ({ electronApp, tempTestDir }) => {
    // setup: create a subdirectory with a file, and an empty folder
    const subDir = path.join(tempTestDir, "subdir")
    const emptyFolder = path.join(tempTestDir, "empty-folder")
    fs.mkdirSync(subDir, { recursive: true })
    fs.mkdirSync(emptyFolder, { recursive: true })
    fs.writeFileSync(path.join(subDir, "existing.md"), "# existing file")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // --- clicking a file → creates in its parent directory ---
    await locateSidebarItem(window, "subdir").click()
    await expect(locateSidebarItem(window, "existing.md")).toBeVisible()
    await locateSidebarItem(window, "existing.md").click()

    await window.getByRole("button", { name: "create file or folder" }).click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await textbox.fill("sibling.txt")
    await textbox.press("Enter", { delay: 100 })

    await expect(locateSidebarItem(window, "sibling.txt")).toBeVisible()
    expect(fs.existsSync(path.join(subDir, "sibling.txt"))).toBe(true)
    expect(fs.existsSync(path.join(tempTestDir, "sibling.txt"))).toBe(false)

    // --- clicking a folder → creates inside it ---
    await locateSidebarItem(window, "empty-folder").click()

    await window.getByRole("button", { name: "create file or folder" }).click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const textbox2 = window.getByRole("textbox", { name: "filename.txt" })
    await textbox2.fill("inside.txt")
    await textbox2.press("Enter", { delay: 100 })

    await expect(locateSidebarItem(window, "inside.txt")).toBeVisible()
    expect(fs.existsSync(path.join(emptyFolder, "inside.txt"))).toBe(true)
    expect(fs.existsSync(path.join(tempTestDir, "inside.txt"))).toBe(false)

    // --- ⌘N also respects last-clicked (still empty-folder) ---
    await window.keyboard.press("Meta+n")

    const textbox3 = window.getByRole("textbox", { name: "filename.txt" })
    await textbox3.fill("hotkey.txt")
    await textbox3.press("Enter", { delay: 100 })

    await expect(locateSidebarItem(window, "hotkey.txt")).toBeVisible()
    expect(fs.existsSync(path.join(emptyFolder, "hotkey.txt"))).toBe(true)
  })

  test("creates file at workspace root when nothing is clicked", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // close the auto-opened getting-started.md so no file is open
    await locateTabCloseButton(window, "getting-started.md").click()

    // no tree item has been clicked, so creation falls back to workspace root
    await window.getByRole("button", { name: "create file or folder" }).click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await expect(textbox).toBeVisible()

    await textbox.fill("root-file.txt")
    await textbox.press("Enter", { delay: 100 })

    await expect(locateSidebarItem(window, "root-file.txt")).toBeVisible()
    expect(fs.existsSync(path.join(tempTestDir, "root-file.txt"))).toBe(true)
  })
})
