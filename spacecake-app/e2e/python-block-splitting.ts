import { expect, test } from "../e2e/fixtures"

test.describe("Python block splitting", () => {
  test("should split a basic python file into correct blocks", async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState("domcontentloaded")

    // Wait for the editor to be visible
    const editor = page.locator('[data-testid="lexical-editor"]')
    await editor.waitFor({ state: "visible" })

    // Focus the editor
    await editor.click()

    const pythonCode = `
import os

def my_function():
    x = 1
    y = 2
    return x + y

class MyClass:
    def __init__(self):
        pass

if __name__ == "__main__":
    print("Hello, World!")
`

    // Type the Python code into the editor
    await page.keyboard.type(pythonCode)

    // Give some time for the block splitting to occur
    await page.waitForTimeout(1000) // Adjust as needed

    // Assert the number and types of blocks
    const blocks = await editor.locator("[data-py-block-kind]").all()
    expect(blocks.length).toBe(5) // import, function, class, main, misc (for the initial empty line)

    // Verify block kinds
    await expect(editor.locator('[data-py-block-kind="import"]')).toBeVisible()
    await expect(
      editor.locator('[data-py-block-kind="function"]')
    ).toBeVisible()
    await expect(editor.locator('[data-py-block-kind="class"]')).toBeVisible()
    await expect(editor.locator('[data-py-block-kind="main"]')).toBeVisible()
    await expect(editor.locator('[data-py-block-kind="misc"]')).toBeVisible() // For the initial empty line

    // Verify specific block content (optional, but good for robustness)
    await expect(editor.locator('[data-py-block-kind="import"]')).toContainText(
      "import os"
    )
    await expect(
      editor.locator('[data-py-block-kind="function"]')
    ).toContainText("def my_function():")
    await expect(editor.locator('[data-py-block-kind="class"]')).toContainText(
      "class MyClass:"
    )
    await expect(editor.locator('[data-py-block-kind="main"]')).toContainText(
      'if __name__ == "__main__":'
    )
  })
})
