import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("Python block splitting", () => {
  test("should split python blocks on navigation and on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create the python file on disk first
    const pythonCode = `import os

def my_function():
    x = 1
    y = 2
    return x + y
  `

    const testFilePath = path.join(tempTestDir, "test_splitting.py")
    fs.writeFileSync(testFilePath, pythonCode, "utf8")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await locateSidebarItem(window, "test_splitting.py").click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByText("import os")).toBeVisible()
    await expect(window.getByText("def my_function():")).toBeVisible()

    // =========================================================================
    // Test 1: Split on navigation (ArrowDown)
    // =========================================================================
    const firstCodeblock = window.getByText("import os")
    await firstCodeblock.click()

    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.type(
      "class MyClass:\n\ndef __init__(self):\n    pass",
      { delay: 100 }
    )

    await expect(window.getByText("class MyClass:")).toBeVisible()

    // trigger split via navigation
    await window.keyboard.press("ArrowDown", { delay: 300 })

    const myClassBlock = editor.locator('[data-block-id="myclass-class"]')
    await expect(myClassBlock).toBeVisible()
    await expect(myClassBlock.getByText("class MyClass:")).toBeVisible()

    // =========================================================================
    // Test 2: Split on save (Ctrl+S)
    // =========================================================================
    // Add another class in the import block to test save-triggered split
    // (same approach as original test - click places cursor, Enter adds lines)
    await firstCodeblock.click()
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.type(
      "class AnotherClass:\n\ndef method(self):\n    pass",
      { delay: 100 }
    )

    await expect(window.getByText("class AnotherClass:")).toBeVisible()

    await window.waitForTimeout(500)

    // trigger split via save
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    const anotherClassBlock = editor.locator(
      '[data-block-id="anotherclass-class"]'
    )
    await expect(anotherClassBlock).toBeVisible()
    await expect(
      anotherClassBlock.getByText("class AnotherClass:")
    ).toBeVisible()
  })
})
