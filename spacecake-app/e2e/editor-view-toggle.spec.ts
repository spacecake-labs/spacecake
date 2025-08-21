import { test, expect } from "./fixtures";
import { getEditorElement } from "./utils";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

test.describe("editor view toggle", () => {
  test.beforeEach(async ({ electronApp }) => {
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

    const page = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();
    await page.getByRole("button", { name: "test.py" }).click();

    const editor = getEditorElement(page, ".cm-editor");
    await expect(editor).toBeVisible();

    // Should start in block view for Python
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "fibonacci" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MathUtils" })).toBeVisible();

    // Toggle to source view
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
    await expect(page.getByText('"""Module docstring"""')).toBeVisible();
    await expect(page.getByText("def fibonacci(n):")).toBeVisible();

    // Toggle back to block view
    await page.getByRole("button", { name: "source" }).click();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "fibonacci" })).toBeVisible();
  });

  test("markdown file can toggle between block and source views", async ({
    electronApp,
    tempTestDir,
  }) => {
    const markdownFile = path.join(tempTestDir, "test.md");
    const markdownContent = `# Test Document

This is a **markdown** file.

## Section 1`;
    fs.writeFileSync(markdownFile, markdownContent);

    const page = await electronApp.firstWindow();
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    });
    await page.getByRole("button", { name: "open folder" }).click();
    await page.getByRole("button", { name: "test.md" }).click();

    // Should start in block view (Lexical)
    await expect(page.getByTestId("lexical-editor")).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Section 1" })).toBeVisible();

    // Toggle to source view (CodeMirror)
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
    await expect(page.getByText("# Test Document")).toBeVisible();
    await expect(page.getByText("## Section 1")).toBeVisible();

    // Toggle back to block view (Lexical)
    await page.getByRole("button", { name: "source" }).click();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Test Document" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
  });

  test("plaintext file shows no toggle option", async ({
    electronApp,
    tempTestDir,
  }) => {
    const textFile = path.join(tempTestDir, "test.txt");
    const textContent = "This is a plain text file.";
    fs.writeFileSync(textFile, textContent);

    const page = await electronApp.firstWindow();
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    });
    await page.getByRole("button", { name: "open folder" }).click();
    await page.getByRole("button", { name: "test.txt" }).click();

    await expect(page.getByTestId("lexical-editor")).toBeVisible();
    await expect(page.getByText(textContent)).toBeVisible();

    // Verify that no view toggle button is present
    await expect(page.getByRole("button", { name: "blocks" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "source" })).not.toBeVisible();
  });

  test("view preference persists when switching between files", async ({
    electronApp,
    tempTestDir,
  }) => {
    const pythonFile1 = path.join(tempTestDir, "file1.py");
    const pythonFile2 = path.join(tempTestDir, "file2.py");
    const pythonContent = `def test_function():
    return "hello"`;
    fs.writeFileSync(pythonFile1, pythonContent);
    fs.writeFileSync(pythonFile2, pythonContent);

    const page = await electronApp.firstWindow();
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    });
    await page.getByRole("button", { name: "open folder" }).click();

    // Open first file and switch to source view
    await page.getByRole("button", { name: "file1.py" }).click();
    await expect(getEditorElement(page, ".cm-editor")).toBeVisible();
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Open second file and verify it's in source view
    await page.getByRole("button", { name: "file2.py" }).click();
    await expect(getEditorElement(page, ".cm-editor")).toBeVisible();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Switch back to first file and verify it's still in source view
    await page.getByRole("button", { name: "file1.py" }).click();
    await expect(getEditorElement(page, ".cm-editor")).toBeVisible();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
  });

  test("README fixture maintains source view through save operations", async ({
    electronApp,
    tempTestDir,
  }) => {
    const fixturePath = path.join(__dirname, "fixtures", "_README.md");
    const testFilePath = path.join(tempTestDir, "_README.md");
    const initialContent = "# An Example README File to Test Parsing";

    if (fs.existsSync(fixturePath)) {
      fs.copyFileSync(fixturePath, testFilePath);
    } else {
      fs.writeFileSync(
        testFilePath,
        `${initialContent}\n\nA brief description.`
      );
    }

    const page = await electronApp.firstWindow();
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
    });
    await page.getByRole("button", { name: "open folder" }).click();

    // Open the README file
    await page.getByRole("button", { name: "_README.md" }).click();

    // Should start in block view (Lexical editor).
    // Wait for the content to be visible first, as it's the most reliable indicator.
    await expect(
      page.getByRole("heading", { name: "An Example README File to Test Parsing" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "blocks" })).toBeVisible();
    await expect(page.getByTestId("lexical-editor")).toBeVisible();

    // Switch to source view (CodeMirror editor)
    await page.getByRole("button", { name: "blocks" }).click();
    const editor = getEditorElement(page, ".cm-editor");
    await expect(editor).toBeVisible();
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify raw markdown is visible
    await expect(page.getByText(initialContent)).toBeVisible();

    // Save the file (no changes) and verify view persists
    await editor.press("ControlOrMeta+s");
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();
    await expect(page.getByText(initialContent)).toBeVisible();

    // Add a new line to the bottom and save
    await editor.press("ControlOrMeta+ArrowDown");
    await editor.press("Enter");
    await editor.type("## New Section Added");

    // Save the changes
    await editor.press("ControlOrMeta+s");

    // Verify toggle still says 'source' and new content is there
    await expect(page.getByRole("button", { name: "source" })).toBeVisible();

    // Verify we're still in source view (raw markdown, not rendered)
    const newContent = "## New Section Added";
    await expect(page.getByText(newContent)).toBeVisible(); // Raw markdown
    await expect(
      page.getByRole("heading", { name: "New Section Added" })
    ).not.toBeVisible(); // Should not see rendered heading
  });
});