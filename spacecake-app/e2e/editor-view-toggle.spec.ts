import { test, expect } from "./fixtures";
import { getEditorElement } from "./utils";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

test.describe("editor view toggle", () => {
  test.beforeAll(async ({ electronApp }) => {
    const page = await electronApp.firstWindow();
    // Clear localStorage to ensure clean state for view preference tests
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test("python file can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Python file with some content
    const pythonFile = path.join(tempTestDir, "test.py");
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
        return n % 2 == 0`;

    fs.writeFileSync(pythonFile, pythonContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    // Clear localStorage to ensure clean state for view preference test
    await page.evaluate(() => {
      localStorage.clear();
    });

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load
    await expect(page.getByText("test.py")).toBeVisible();

    // Click on the Python file to open it
    await page.getByRole("button", { name: "test.py" }).click();

    // Wait for the editor to load and check initial view (should be block view for Python)
    await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Verify we're in block view by checking for block-specific elements
    await expect(
      page.getByRole("heading", { name: "fibonacci" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "MathUtils" })
    ).toBeVisible();

    // Click the toggle button to switch to source view
    await page.getByRole("button", { name: "blocks" }).click();

    // Wait for the view to change and verify we're now in source view
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify the content is now displayed as a single source block
    await expect(page.getByText('"""Module docstring"""')).toBeVisible();
    await expect(page.getByText("def fibonacci(n):")).toBeVisible();
    await expect(page.getByText("class MathUtils:")).toBeVisible();

    // Click the toggle button again to switch back to block view
    await page.getByRole("button", { name: "source" }).click();

    // Verify we're back in block view
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Verify block-specific elements are visible again
    await expect(
      page.getByRole("heading", { name: "fibonacci" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "MathUtils" })
    ).toBeVisible();
  });

  test("markdown file can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Markdown file with some content
    const markdownFile = path.join(tempTestDir, "test.md");
    const markdownContent = `# Test Document

This is a **markdown** file with some content.

## Section 1

- Item 1
- Item 2
- Item 3

## Section 2

Some more content here.`;

    fs.writeFileSync(markdownFile, markdownContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load
    await expect(page.getByText("test.md")).toBeVisible();

    // Click on the Markdown file to open it
    await page.getByRole("button", { name: "test.md" }).click();

    // Wait for the editor to load and check that toggle is available
    // await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Verify we're in block view by checking for rendered markdown
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible();
    await expect(
      page.getByText("This is a markdown file with some content.")
    ).toBeVisible();

    // Click the toggle button to switch to source view
    await page.getByRole("button", { name: "blocks" }).click();

    // Wait for the view to change and verify we're now in source view
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify the content is now displayed as raw markdown
    await expect(page.getByText("# Test Document")).toBeVisible();
    await expect(page.getByText("## Section 1")).toBeVisible();
    await expect(page.getByText("- Item 1")).toBeVisible();

    // Click the toggle button again to switch back to block view
    await page.getByRole("button", { name: "source" }).click();

    // Verify we're back in block view
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Verify rendered markdown is visible again (check for HTML elements, not raw syntax)
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Section 1" })
    ).toBeVisible();
    await expect(
      page.getByText("This is a markdown file with some content.")
    ).toBeVisible();
  });

  test("plaintext file shows no toggle option", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a plaintext file
    const textFile = path.join(tempTestDir, "test.txt");
    const textContent = `This is a plain text file.
It has multiple lines.
No special formatting or syntax highlighting.`;

    fs.writeFileSync(textFile, textContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load
    await expect(page.getByText("test.txt")).toBeVisible();

    // Click on the text file to open it
    await page.getByRole("button", { name: "test.txt" }).click();

    // Wait for the editor to load and verify no toggle button is shown
    await expect(page.locator(".ContentEditable__root").first()).toBeVisible();
    await expect(page.getByText("This is a plain text file.")).toBeVisible();
    await expect(page.getByText("It has multiple lines.")).toBeVisible();
    await expect(
      page.getByText("No special formatting or syntax highlighting.")
    ).toBeVisible();

    // Verify that no view toggle button is present
    await expect(
      page.getByRole("button", { name: "blocks" })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "source" })
    ).not.toBeVisible();
  });

  test("view preference persists when switching between files", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create two Python files
    const pythonFile1 = path.join(tempTestDir, "file1.py");
    const pythonFile2 = path.join(tempTestDir, "file2.py");

    const pythonContent = `"""Test file"""

def test_function():
    return "hello world"`;

    fs.writeFileSync(pythonFile1, pythonContent);
    fs.writeFileSync(pythonFile2, pythonContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load
    await expect(page.getByText("file1.py")).toBeVisible();
    await expect(page.getByText("file2.py")).toBeVisible();

    // Open first Python file
    await page.getByRole("button", { name: "file1.py" }).click();
    await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Switch to source view
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Switch to second Python file
    await page.getByRole("button", { name: "file2.py" }).click();

    // Verify the second file also opens in source view (preference should persist)
    await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Switch back to first file
    await page.getByRole("button", { name: "file1.py" }).click();

    // Verify it's still in source view
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
  });

  test("view preference persists after file save", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Python file
    const pythonFile = path.join(tempTestDir, "test_save.py");
    const pythonContent = `"""Test file for save persistence"""

def test_function():
    return "hello world"`;

    fs.writeFileSync(pythonFile, pythonContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load and open the file
    await expect(page.getByText("test_save.py")).toBeVisible();
    await page.getByRole("button", { name: "test_save.py" }).click();
    await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Switch to source view
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Save the file (no changes) - this was the bug we fixed
    await page.keyboard.press("Control+s", { delay: 100 });
    await page.locator(".cm-editor").first().waitFor({ state: "visible" });

    // Verify we're still in source view
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify the content is still displayed as source (raw text)
    await expect(
      page.getByText('"""Test file for save persistence"""')
    ).toBeVisible();
    await expect(page.getByText("def test_function():")).toBeVisible();
  });

  test("view preference persists during file operations", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Create a Markdown file
    const markdownFile = path.join(tempTestDir, "test_operations.md");
    const markdownContent = `# Test Document

This is a test file for operations.`;

    fs.writeFileSync(markdownFile, markdownContent);

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load and open the file
    await expect(page.getByText("test_operations.md")).toBeVisible();
    await page.getByRole("button", { name: "test_operations.md" }).click();
    await expect(page.locator(".ContentEditable__root").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Switch to source view
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify we're in source view (raw markdown visible)
    await expect(page.getByText("# Test Document")).toBeVisible();
    await expect(
      page.getByText("This is a test file for operations.")
    ).toBeVisible();

    // Make a change and save
    // Click into the editor content to ensure proper focus
    await page.getByText("# Test Document").click();
    await expect(page.locator(".cm-editor").first()).toHaveClass(/focused/);
    await page.keyboard.press("ControlOrMeta+ArrowDown", { delay: 100 });
    await page.keyboard.press("Enter", { delay: 100 });
    await page.keyboard.type("New line added", { delay: 100 });
    await page.keyboard.press("Control+s", { delay: 100 });
    await page.locator(".cm-editor").first().waitFor({ state: "visible" });

    // Verify we're still in source view
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify the new content is there but still in source view
    await expect(page.getByText("# Test Document")).toBeVisible();
    await expect(page.getByText("New line added")).toBeVisible();

    // Verify we're still seeing raw markdown (not rendered)
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).not.toBeVisible(); // Should not see rendered heading
  });

  test("README fixture maintains source view through save operations", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Copy the _README fixture file to the test directory
    const fixturePath = path.join(__dirname, "fixtures", "_README.md");
    const testFilePath = path.join(tempTestDir, "_README.md");

    if (fs.existsSync(fixturePath)) {
      fs.copyFileSync(fixturePath, testFilePath);
    } else {
      // Fallback: create a simple README if fixture doesn't exist
      const fallbackContent = `# An Example README File to Test Parsing

A brief description of what this project does and who it's for.`;
      fs.writeFileSync(testFilePath, fallbackContent);
    }

    // Open the app and open the test directory
    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load and open the README file
    await expect(page.getByText("_README.md")).toBeVisible();
    await page.getByRole("button", { name: "_README.md" }).click();
    await expect(page.locator(".ContentEditable__root").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();

    // Switch to source view
    await page.getByRole("button", { name: "blocks" }).click();

    // Verify we're in source view and toggle shows 'source'
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify raw markdown is visible
    await expect(
      page.getByText("# An Example README File to Test Parsing")
    ).toBeVisible();

    // Save the file (no changes) and verify view persists
    await page.keyboard.press("Control+s", { delay: 100 });
    await page.locator(".cm-editor").first().waitFor({ state: "visible" });

    // Verify toggle still says 'source' and content is the same
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
    await expect(
      page.getByText("# An Example README File to Test Parsing")
    ).toBeVisible();

    // Add a new line to the bottom and save
    // Directly focus the editor content area
    // await focusEditor(page, ".cm-editor");
    await page.getByText("# An Example README File to Test Parsing").click();
    // await focusEditor(page);
    await expect(getEditorElement(page, ".cm-editor")).toBeFocused();
    // await focusEditor(page);

    await page.waitForTimeout(350);

    await page.keyboard.press("ControlOrMeta+ArrowDown", { delay: 100 });
    await expect(getEditorElement(page, ".cm-editor")).toBeFocused();

    await page.waitForTimeout(350);

    await page.keyboard.press("Enter", { delay: 100 });
    await expect(getEditorElement(page, ".cm-editor")).toBeFocused();

    await page.keyboard.type("## New Section Added", { delay: 100 });
    await expect(getEditorElement(page, ".cm-editor")).toBeFocused();

    await page.keyboard.press("Control+s", { delay: 100 });

    await expect(getEditorElement(page, ".cm-editor")).toBeVisible();

    // Verify toggle still says 'source' and new content is there
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify we're still in source view (raw markdown, not rendered)
    await expect(page.getByText("## New Section Added")).toBeVisible(); // Raw markdown
    await expect(
      page.getByRole("heading", { name: "New Section Added" })
    ).not.toBeVisible(); // Should not see rendered heading
  });
});
