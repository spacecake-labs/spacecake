import { test, expect } from "./fixtures";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

test.describe("editor view toggle", () => {
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

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await page.getByRole("button", { name: "open folder" }).click();

    // Wait for the workspace to load
    await expect(page.getByText("test.py")).toBeVisible();

    // Click on the Python file to open it
    await page.getByText("test.py").click();

    // Wait for the editor to load and check initial view (should be block view for Python)
    await expect(page.getByText("blocks")).toBeVisible();

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
    await expect(page.getByText("source")).toBeVisible();

    // Verify the content is now displayed as a single source block
    await expect(page.getByText('"""Module docstring"""')).toBeVisible();
    await expect(page.getByText("def fibonacci(n):")).toBeVisible();
    await expect(page.getByText("class MathUtils:")).toBeVisible();

    // Click the toggle button again to switch back to block view
    await page.getByRole("button", { name: "source" }).click();

    // Verify we're back in block view
    await expect(page.getByText("blocks")).toBeVisible();

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
    await page.getByText("test.md").click();

    // Wait for the editor to load and check that toggle is available
    await expect(page.getByText("blocks")).toBeVisible();

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
    await expect(page.getByText("source")).toBeVisible();

    // Verify the content is now displayed as raw markdown
    await expect(page.getByText("# Test Document")).toBeVisible();
    await expect(page.getByText("## Section 1")).toBeVisible();
    await expect(page.getByText("- Item 1")).toBeVisible();

    // Click the toggle button again to switch back to block view
    await page.getByRole("button", { name: "source" }).click();

    // Verify we're back in block view
    await expect(page.getByText("blocks")).toBeVisible();

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
    await page.getByText("test.txt").click();

    // Wait for the editor to load and verify no toggle button is shown
    await expect(page.getByText("This is a plain text file.")).toBeVisible();
    await expect(page.getByText("It has multiple lines.")).toBeVisible();
    await expect(
      page.getByText("No special formatting or syntax highlighting.")
    ).toBeVisible();

    // Verify that no view toggle button is present
    await expect(page.getByText("blocks")).not.toBeVisible();
    await expect(page.getByText("source")).not.toBeVisible();
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
    await page.getByText("file1.py").click();
    await expect(page.getByText("blocks")).toBeVisible();

    // Switch to source view
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByText("source")).toBeVisible();

    // Switch to second Python file
    await page.getByText("file2.py").click();

    // Verify the second file also opens in source view (preference should persist)
    await expect(page.getByText("source")).toBeVisible();

    // Switch back to first file
    await page.getByRole("button", { name: "file1.py" }).click();

    // Verify it's still in source view
    await expect(page.getByText("source")).toBeVisible();
  });
});
