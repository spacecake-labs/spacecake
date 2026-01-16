import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("editor view toggle", () => {
  test("different file types toggle between rich and source views correctly", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create test files for all file types
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

    const pythonMdFile = path.join(tempTestDir, "test_md.py")
    const pythonMdContent = `"""Module with markdown documentation."""

import os

#🍰 # main section
#🍰 this is a paragraph with **bold** text

def fibonacci(n):
    return n`
    fs.writeFileSync(pythonMdFile, pythonMdContent)

    const markdownFile = path.join(tempTestDir, "test.md")
    const markdownContent = `# Test Document

This is a **markdown** file.

## Section 1`
    fs.writeFileSync(markdownFile, markdownContent)

    const textFile = path.join(tempTestDir, "test.txt")
    const textContent = "This is a plain text file."
    fs.writeFileSync(textFile, textContent)

    const page = await electronApp.firstWindow()
    await waitForWorkspace(page)

    // =========================================================================
    // Test 1: Python file toggle
    // =========================================================================
    await page.getByRole("button", { name: "test.py" }).click()
    const editor = page.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // Should start in rich view
    await expect(
      page.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "fibonacci" }).first()
    ).toBeVisible()

    // Toggle to source view
    await page.getByRole("link", { name: "switch to source view" }).click()
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()
    await expect(page.getByText('"""Module docstring"""')).toBeVisible()

    // Toggle back to rich view
    await page.getByRole("link", { name: "switch to rich view" }).click()
    await expect(
      page.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    // =========================================================================
    // Test 2: Python with markdown directives toggle
    // =========================================================================
    await page.getByRole("button", { name: "test_md.py" }).click()
    await expect(editor).toBeVisible()

    // Verify markdown directives are rendered in rich view
    await expect(
      page.getByRole("heading", { name: "main section" })
    ).toBeVisible()
    await expect(
      page.getByText("this is a paragraph with").first()
    ).toBeVisible()

    // Toggle to source view
    await page.getByRole("link", { name: "switch to source view" }).click()
    await expect(page.getByText("#🍰 # main section")).toBeVisible()

    // Toggle back
    await page.getByRole("link", { name: "switch to rich view" }).click()

    // =========================================================================
    // Test 3: Markdown file toggle
    // =========================================================================
    await page.getByRole("button", { name: "test.md" }).click()
    await expect(editor).toBeVisible()

    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible()

    // Toggle to source view
    await page.getByRole("link", { name: "switch to source view" }).click()
    await expect(page.getByText("# Test Document")).toBeVisible()

    // Toggle back
    await page.getByRole("link", { name: "switch to rich view" }).click()

    // =========================================================================
    // Test 4: Plaintext file shows no toggle option
    // =========================================================================
    await page.getByRole("button", { name: "test.txt" }).click()
    await expect(editor).toBeVisible()
    await expect(page.getByText(textContent)).toBeVisible()

    // Verify no toggle buttons
    await expect(
      page.getByRole("link", { name: "switch to source view" })
    ).not.toBeVisible()
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).not.toBeVisible()
  })

  test("view preference persists across file switches and saves", async ({
    electronApp,
    tempTestDir,
  }) => {
    const pythonFile1 = path.join(tempTestDir, "file1.py")
    const pythonFile2 = path.join(tempTestDir, "file2.py")
    const pythonContent = `def test_function():
    return "hello"`
    fs.writeFileSync(pythonFile1, pythonContent)
    fs.writeFileSync(pythonFile2, pythonContent)

    const header = "An Example README File to Test Parsing"
    const readmeContent = `# ${header}\n\nA brief description.`
    const readmePath = path.join(tempTestDir, "_README.md")
    fs.writeFileSync(readmePath, readmeContent)

    const page = await electronApp.firstWindow()
    await waitForWorkspace(page)

    // =========================================================================
    // Test 1: View preference persists when switching between files
    // =========================================================================
    // Open first file and switch to source view
    await page.getByRole("button", { name: "file1.py" }).click()
    await expect(page.getByTestId("lexical-editor")).toBeVisible()
    await page.getByRole("link", { name: "switch to source view" }).click()
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()

    // Open second file - should be in rich view (default)
    await page.getByRole("button", { name: "file2.py" }).click()
    await expect(
      page.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    // Switch back to first file - should still be in source view
    await page.getByRole("button", { name: "file1.py" }).click()
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()

    // =========================================================================
    // Test 2: Source view persists through save operations
    // =========================================================================
    await page.getByRole("button", { name: "_README.md" }).click()
    const editor = page.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // Start in rich view
    await expect(page.getByRole("heading", { name: header })).toBeVisible()

    // Switch to source view
    await page.getByRole("link", { name: "switch to source view" }).click()
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()

    // Save without changes - view should persist
    await editor.press("ControlOrMeta+s", { delay: 500 })
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()

    // Add content and save
    await page.getByText(header).click({ delay: 100 })
    await editor.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await editor.press("Enter", { delay: 100 })
    await editor.pressSequentially("## New Section Added", { delay: 100 })

    await page.waitForTimeout(250)
    await editor.press("ControlOrMeta+s", { delay: 500 })

    // Still in source view after save
    await expect(
      page.getByRole("link", { name: "switch to rich view" })
    ).toBeVisible()
    await expect(page.getByText("## New Section Added")).toBeVisible()

    // Toggle to rich view to verify content
    await page.getByRole("link", { name: "switch to rich view" }).click()
    await expect(
      page.getByRole("heading", { name: "New Section Added" })
    ).toBeVisible()
  })
})
