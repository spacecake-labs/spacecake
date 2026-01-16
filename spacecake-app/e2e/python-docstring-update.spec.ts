import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("Python docstring updating", () => {
  test("should update docstring on navigation and on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create two python files to test both triggers
    const pythonCode1 = `def my_function():
    """A docstring."""
    pass
`
    const pythonCode2 = `def another_function():
    """Another docstring."""
    pass
`

    const testFilePath1 = path.join(tempTestDir, "test_docstring.py")
    const testFilePath2 = path.join(tempTestDir, "test_docstring_save.py")
    fs.writeFileSync(testFilePath1, pythonCode1, "utf8")
    fs.writeFileSync(testFilePath2, pythonCode2, "utf8")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // =========================================================================
    // Test 1: Update docstring on navigation
    // =========================================================================
    await window
      .getByRole("button", { name: "test_docstring.py" })
      .first()
      .click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    const codeBlock1 = editor.locator('[data-block-id*="my_function-function"]')
    await expect(codeBlock1).toBeVisible()

    const docSection1 = codeBlock1.locator('[data-section="doc"]')
    const codeSection1 = codeBlock1.locator('[data-section="code"]')

    await expect(docSection1.getByText("A docstring.")).toBeVisible()

    // unfold and edit docstring
    await codeSection1.getByLabel("folded code").click()
    await codeSection1.getByText("docstring").first().dblclick()
    await codeSection1.pressSequentially("test", { delay: 100 })

    // trigger update via navigation
    await window.keyboard.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await window.keyboard.press("ArrowDown", { delay: 100 })

    await expect(docSection1.getByText("A test.")).toBeVisible()

    // =========================================================================
    // Test 2: Update docstring on save
    // =========================================================================
    await window
      .getByRole("button", { name: "test_docstring_save.py" })
      .first()
      .click()

    await expect(editor).toBeVisible()

    const codeBlock2 = editor.locator(
      '[data-block-id*="another_function-function"]'
    )
    await expect(codeBlock2).toBeVisible()

    const docSection2 = codeBlock2.locator('[data-section="doc"]')
    const codeSection2 = codeBlock2.locator('[data-section="code"]')

    await expect(docSection2.getByText("Another docstring.")).toBeVisible()

    // unfold and edit docstring
    await codeSection2.getByLabel("folded code").click()
    await codeSection2.getByText("docstring").first().dblclick()
    await codeSection2.pressSequentially("test", { delay: 100 })

    await window.waitForTimeout(500)

    // trigger update via save
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    await expect(editor).toBeVisible()
    await expect(docSection2.getByText("Another test.")).toBeVisible()
  })
})
