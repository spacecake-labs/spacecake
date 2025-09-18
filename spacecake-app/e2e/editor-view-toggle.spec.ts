import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("editor view toggle", () => {
  test("python file can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Python file with some content
    const pythonFile = path.join(tempTestDir, "test.py")
    const pythonContent = `"""Module docstring"""

def fibonacci(n):
    """Calculate fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class MathUtils:
    """Utility class for math operations."""
    
    @staticmethod
    def is_even(n):
        return n % 2 == 0`

    fs.writeFileSync(pythonFile, pythonContent)

    const page = await electronApp.firstWindow()

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await page.getByRole("button", { name: "open folder" }).click()
    await page.getByRole("button", { name: "test.py" }).click()

    const editor = page.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // Should start in block view for Python
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "fibonacci" }).first()
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "MathUtils" }).first()
    ).toBeVisible()

    // Toggle to source view
    await page.getByRole("button", { name: "blocks" }).click()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()
    await expect(page.getByText('"""Module docstring"""')).toBeVisible()
    await expect(page.getByText("def fibonacci(n):")).toBeVisible()

    // Toggle back to block view
    await page.getByRole("button", { name: "source" }).click()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "fibonacci" }).first()
    ).toBeVisible()
  })

  test("python file with markdown directives can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Python file with markdown directives
    const pythonFile = path.join(tempTestDir, "test_md.py")
    const pythonContent = `"""Module with markdown documentation."""

import os
import sys

#🍰 # main section
#🍰 this is a paragraph with **bold** and *italic* text
#🍰 
#🍰 ## subsection
#🍰 - list item 1
#🍰 - list item 2

def fibonacci(n):
    """Calculate fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

#🍰 ## usage
#🍰 call the function like this:
#🍰 \`\`\`python
#🍰 result = fibonacci(10)
#🍰 \`\`\`

class MathUtils:
    """Utility class for math operations."""
    
    @staticmethod
    def is_even(n):
        return n % 2 == 0`

    fs.writeFileSync(pythonFile, pythonContent)

    const page = await electronApp.firstWindow()

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await page.getByRole("button", { name: "open folder" }).click()
    await page.getByRole("button", { name: "test_md.py" }).click()

    const editor = page.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // Should start in block view for Python
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "fibonacci" }).first()
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "MathUtils" })).toBeVisible()

    // Verify markdown directives are rendered in block view
    await expect(
      page.getByRole("heading", { name: "main section" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "subsection" })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "usage" })).toBeVisible()
    await expect(
      page.getByText("this is a paragraph with").first()
    ).toBeVisible()
    await expect(page.getByText("list item 1").first()).toBeVisible()
    await expect(page.getByText("list item 2").first()).toBeVisible()

    // Toggle to source view
    await page.getByRole("button", { name: "blocks" }).click()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // Verify raw Python code is visible
    await expect(
      page.getByText('"""Module with markdown documentation."""')
    ).toBeVisible()
    await expect(page.getByText("def fibonacci(n):")).toBeVisible()
    await expect(page.getByText("class MathUtils:")).toBeVisible()

    // Verify markdown directives show the #🍰 syntax in source view
    await expect(page.getByText("#🍰 # main section")).toBeVisible()
    await expect(
      page.getByText("#🍰 this is a paragraph with **bold** and *italic* text")
    ).toBeVisible()
    await expect(page.getByText("#🍰 ## subsection")).toBeVisible()
    await expect(page.getByText("#🍰 - list item 1")).toBeVisible()
    await expect(page.getByText("#🍰 - list item 2")).toBeVisible()
    await expect(page.getByText("#🍰 ## usage")).toBeVisible()
    await expect(
      page.getByText("#🍰 call the function like this:")
    ).toBeVisible()
    await expect(page.getByText("#🍰 ```python", { exact: true })).toBeVisible()
    await expect(page.getByText("#🍰 result = fibonacci(10)")).toBeVisible()
    await expect(page.getByText("#🍰 ```", { exact: true })).toBeVisible()

    // Toggle back to block view
    await page.getByRole("button", { name: "source" }).click()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "fibonacci" }).first()
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "main section" })
    ).toBeVisible()
  })

  test("markdown file can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    const markdownFile = path.join(tempTestDir, "test.md")
    const markdownContent = `# Test Document

This is a **markdown** file.

## Section 1`
    fs.writeFileSync(markdownFile, markdownContent)

    const page = await electronApp.firstWindow()
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    })
    await page.getByRole("button", { name: "open folder" }).click()
    await page.getByRole("button", { name: "test.md" }).click()

    // Should start in block view (Lexical)
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Section 1" })).toBeVisible()

    // Toggle to source view (CodeMirror)
    await page.getByRole("button", { name: "blocks" }).click()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()
    await expect(page.getByText("# Test Document")).toBeVisible()
    await expect(page.getByText("## Section 1")).toBeVisible()

    // Toggle back to block view (Lexical)
    await page.getByRole("button", { name: "source" }).click()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Section 1" })).toBeVisible()
  })

  test("plaintext file shows no toggle option", async ({
    electronApp,
    tempTestDir,
  }) => {
    const textFile = path.join(tempTestDir, "test.txt")
    const textContent = "This is a plain text file."
    fs.writeFileSync(textFile, textContent)

    const page = await electronApp.firstWindow()
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    })
    await page.getByRole("button", { name: "open folder" }).click()
    await page.getByRole("button", { name: "test.txt" }).click()

    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByText(textContent)).toBeVisible()

    // Verify that no view toggle button is present
    await expect(page.getByRole("button", { name: "blocks" })).not.toBeVisible()
    await expect(page.getByRole("button", { name: "source" })).not.toBeVisible()
  })

  test("view preference persists when switching between files", async ({
    electronApp,
    tempTestDir,
  }) => {
    const pythonFile1 = path.join(tempTestDir, "file1.py")
    const pythonFile2 = path.join(tempTestDir, "file2.py")
    const pythonContent = `def test_function():
    return "hello"`
    fs.writeFileSync(pythonFile1, pythonContent)
    fs.writeFileSync(pythonFile2, pythonContent)

    const page = await electronApp.firstWindow()
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    })
    await page.getByRole("button", { name: "open folder" }).click()

    // Open first file and switch to source view
    await page.getByRole("button", { name: "file1.py" }).click()
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await page.getByRole("button", { name: "blocks" }).click()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // Open second file and verify it's in source view
    await page.getByRole("button", { name: "file2.py" }).click()
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // Switch back to first file and verify it's still in source view
    await page.getByRole("button", { name: "file1.py" }).click()
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()
  })

  test("README fixture maintains source view through save operations", async ({
    electronApp,
    tempTestDir,
  }) => {
    const fixturePath = path.join(__dirname, "fixtures", "_README.md")
    const testFilePath = path.join(tempTestDir, "_README.md")
    const header = "An Example README File to Test Parsing"
    const initialContent = `# ${header}\n\nA brief description.`

    if (fs.existsSync(fixturePath)) {
      fs.copyFileSync(fixturePath, testFilePath)
    } else {
      fs.writeFileSync(testFilePath, initialContent)
    }

    const page = await electronApp.firstWindow()
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    })
    await page.getByRole("button", { name: "open folder" }).click()

    // Open the README file
    await page.getByRole("button", { name: "_README.md" }).click()
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()

    // Should start in block view (Lexical editor).
    // Wait for the content to be visible first, as it's the most reliable indicator.
    await expect(
      page.getByRole("heading", {
        name: header,
      })
    ).toBeVisible()

    // Switch to source view (CodeMirror editor)
    await page.getByRole("button", { name: "blocks" }).click()
    const editor = page.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // Verify raw markdown is visible
    await expect(page.getByText(header)).toBeVisible()

    // Save the file (no changes) and verify view persists
    await editor.press("ControlOrMeta+s", { delay: 300 })
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // verify the file was saved with the exact same content
    const savedContent = fs.readFileSync(testFilePath, "utf-8")
    expect(savedContent).toBe(initialContent)

    await expect(page.getByText(header)).toBeVisible()
    await page.getByText(header).click({ delay: 100 })

    // Add a new line to the bottom and save
    await editor.press("ControlOrMeta+ArrowDown", { delay: 100 })

    await editor.press("Enter", { delay: 100 })

    await editor.pressSequentially("## New Section Added", { delay: 100 })

    // Save the changes
    await editor.press("ControlOrMeta+s", { delay: 100 })

    await expect(page.getByTestId("lexical-editor")).toBeVisible()

    // Verify toggle still says 'source' and new content is there
    await expect(page.getByRole("button", { name: "source" })).toBeVisible()

    // Verify we're still in source view (raw markdown, not rendered)
    const newContent = "## New Section Added"
    await expect(page.getByText(newContent)).toBeVisible() // Raw markdown

    // Toggle back to source view
    await page.getByRole("button", { name: "source" }).click()

    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible()

    await expect(
      page.getByRole("heading", { name: "New Section Added" })
    ).toBeVisible()
  })
})
