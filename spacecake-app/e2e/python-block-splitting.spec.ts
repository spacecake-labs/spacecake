import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("Python block splitting", () => {
  test("splits a new class into its own block on save", async ({ electronApp, tempTestDir }) => {
    const window = await electronApp.firstWindow()

    const pythonCode = `import os

def my_function():
    x = 1
    y = 2
    return x + y
  `

    const testFilePath = path.join(tempTestDir, "test_splitting.py")
    fs.writeFileSync(testFilePath, pythonCode, "utf8")

    await waitForWorkspace(window)
    await locateSidebarItem(window, "test_splitting.py").click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // python opens in source by default; toggle to rich for block splitting
    await window.getByRole("link", { name: "switch to rich view" }).click()
    await expect(window.getByRole("link", { name: "switch to source view" })).toBeVisible()
    await expect(window.getByText("import os")).toBeVisible()

    // add a class in the import block
    const firstCodeblock = window.getByText("import os")
    await firstCodeblock.click()
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.type("class MyClass:\n\ndef __init__(self):\n    pass", { delay: 100 })
    await expect(window.getByText("class MyClass:")).toBeVisible()

    await window.waitForTimeout(500)

    // trigger split via save
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    const myClassBlock = editor.locator('[data-block-id="myclass-class"]')
    await expect(myClassBlock).toBeVisible()
    await expect(myClassBlock.getByText("class MyClass:")).toBeVisible()
  })
})
