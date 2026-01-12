import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("Python block splitting", () => {
  test("should split python blocks on navigation out of a code block", async ({
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
    await window
      .getByRole("button", { name: "test_splitting.py" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByText("import os")).toBeVisible()
    await expect(window.getByText("def my_function():")).toBeVisible()

    // focus the code block toolbar and verify block types are present
    const firstCodeblock = window.getByText("import os")
    await firstCodeblock.click()

    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.type(
      "class MyClass:\n\ndef __init__(self):\n    pass",
      { delay: 100 }
    )

    await expect(window.getByText("class MyClass:")).toBeVisible()
    await window.keyboard.press("ArrowDown", { delay: 300 })

    const secondCodeblock = editor.locator('[data-block-id="myclass-class"]')
    await expect(secondCodeblock).toBeVisible()
    await expect(secondCodeblock.getByText("class MyClass:")).toBeVisible()
  })
  test("should split python blocks on save", async ({
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
    await window
      .getByRole("button", { name: "test_splitting.py" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByText("import os")).toBeVisible()
    await expect(window.getByText("def my_function():")).toBeVisible()

    // focus the code block toolbar and verify block types are present
    const firstCodeblock = window.getByText("import os")
    await firstCodeblock.click()

    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.press("Enter", { delay: 100 })

    await window.keyboard.type(
      "class MyClass:\n\ndef __init__(self):\n    pass",
      {
        delay: 100,
      }
    )

    await expect(window.getByText("class MyClass:")).toBeVisible()

    await window.waitForTimeout(1000)

    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    const secondCodeblock = editor.locator('[data-block-id="myclass-class"]')
    await expect(secondCodeblock).toBeVisible()
    await expect(secondCodeblock.getByText("class MyClass:")).toBeVisible()
  })
})
