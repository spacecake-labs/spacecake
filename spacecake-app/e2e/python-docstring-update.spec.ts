import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("Python docstring updating", () => {
  test("should update docstring on navigation out of a code block", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create the python file on disk first
    const pythonCode = `def my_function():
    """A docstring."""
    pass
`

    const testFilePath = path.join(tempTestDir, "test_docstring.py")
    fs.writeFileSync(testFilePath, pythonCode, "utf8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "test_docstring.py" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    // find the code block by data-block-id
    const codeBlock = editor.locator('[data-block-id*="my_function-function"]')
    await expect(codeBlock).toBeVisible()

    const docSection = codeBlock.locator('[data-section="doc"]')
    const codeSection = codeBlock.locator('[data-section="code"]')

    // verify docstring is initially rendered in the docstring section
    await expect(docSection.getByText("A docstring.")).toBeVisible()

    // unfold the docstring section
    await codeSection.getByLabel("folded code").click()

    // click on the code block to focus it
    await codeSection.getByText("docstring").first().dblclick()

    await codeSection.pressSequentially("test", { delay: 100 })

    await window.keyboard.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await window.keyboard.press("ArrowDown", { delay: 100 })

    // verify the docstring section has been updated
    await expect(docSection.getByText("A test.")).toBeVisible()
  })

  test("should update docstring on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create the python file on disk first
    const pythonCode = `def my_function():
    """A docstring."""
    pass
`

    const testFilePath = path.join(tempTestDir, "test_docstring_save.py")
    fs.writeFileSync(testFilePath, pythonCode, "utf8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "test_docstring_save.py" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    // find the code block by data-block-id
    const codeBlock = editor.locator('[data-block-id*="my_function-function"]')
    await expect(codeBlock).toBeVisible()

    const docSection = codeBlock.locator('[data-section="doc"]')
    const codeSection = codeBlock.locator('[data-section="code"]')

    // verify docstring is initially rendered in the docstring section
    await expect(docSection.getByText("A docstring.")).toBeVisible()

    // unfold the docstring section
    await codeSection.getByLabel("folded code").click()

    // click on the code block to focus it
    await codeSection.getByText("docstring").first().dblclick()

    await codeSection.pressSequentially("test", { delay: 100 })

    await window.waitForTimeout(500)

    // save the file
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    await expect(editor).toBeVisible()
    // verify the docstring section has been updated
    await expect(docSection.getByText("A test.")).toBeVisible()
  })
})
