import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("Python docstring updating", () => {
  test("updates doc section after editing docstring and saving", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    const pythonCode = `def my_function():
    """A docstring."""
    pass
`

    const testFilePath = path.join(tempTestDir, "test_docstring.py")
    fs.writeFileSync(testFilePath, pythonCode, "utf8")

    await waitForWorkspace(window)
    await locateSidebarItem(window, "test_docstring.py").click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    // python opens in source by default; toggle to rich for block rendering
    await window.getByRole("link", { name: "switch to rich view" }).click()
    await expect(window.getByRole("link", { name: "switch to source view" })).toBeVisible()

    const codeBlock = editor.locator('[data-block-id*="my_function-function"]')
    await expect(codeBlock).toBeVisible()

    const docSection = codeBlock.locator('[data-section="doc"]')
    const codeSection = codeBlock.locator('[data-section="code"]')

    await expect(docSection.getByText("A docstring.")).toBeVisible()

    // unfold and edit docstring
    await codeSection.getByLabel("folded code").click()
    await codeSection.getByText("docstring").first().dblclick()
    await codeSection.pressSequentially("test", { delay: 100 })

    await window.waitForTimeout(500)

    // trigger update via save
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    await expect(editor).toBeVisible()
    await expect(docSection.getByText("A test.")).toBeVisible()
  })
})
