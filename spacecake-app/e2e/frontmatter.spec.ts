import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("frontmatter e2e", () => {
  // Single test with multiple assertions to minimize app startup overhead
  test("create frontmatter, toggle views, and verify content", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // Create an empty markdown file
    const filePath = path.join(tempTestDir, "test-frontmatter.md")
    fs.writeFileSync(filePath, "")

    await waitForWorkspace(window)

    // Open the file
    await window
      .getByRole("button", { name: "test-frontmatter.md" })
      .first()
      .click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    const editor = window.getByTestId("lexical-editor")

    // =========================================================================
    // Test 1: Create frontmatter using markdown shortcut "--- "
    // =========================================================================
    await editor.click()
    await editor.type("--- ")

    // Verify frontmatter node is created
    await expect(window.getByTestId("frontmatter-node")).toBeVisible()

    // When created via shortcut, it starts in code view
    await expect(window.getByTestId("frontmatter-code-editor")).toBeVisible()

    // Type some YAML content
    const codeEditor = window.getByTestId("frontmatter-code-editor")
    const codeMirror = codeEditor.locator(".cm-editor")
    await expect(codeMirror).toBeVisible()
    await codeMirror.click()
    await codeMirror.pressSequentially("title: My Document\nauthor: Test User")

    // Wait for content to be processed
    await window.waitForTimeout(300)

    // =========================================================================
    // Test 2: Toggle to table view and verify table rendering
    // =========================================================================
    const toggleButton = window.getByTestId("frontmatter-toggle-view-mode")
    await toggleButton.click()

    // Code editor should be hidden, table should be visible
    await expect(
      window.getByTestId("frontmatter-code-editor")
    ).not.toBeVisible()
    await expect(window.getByTestId("frontmatter-table")).toBeVisible()

    // Verify property names appear in the table
    const table = window.getByTestId("frontmatter-table")
    await expect(table).toContainText("title")
    await expect(table).toContainText("author")
    await expect(table).toContainText("My Document")
    await expect(table).toContainText("Test User")

    // =========================================================================
    // Test 3: Toggle back to code view and verify YAML is preserved
    // =========================================================================
    await toggleButton.click()

    await expect(window.getByTestId("frontmatter-code-editor")).toBeVisible()
    await expect(window.getByTestId("frontmatter-table")).not.toBeVisible()

    // Verify YAML content is still there
    const codeEditorAfter = window.getByTestId("frontmatter-code-editor")
    await expect(codeEditorAfter.locator(".cm-editor")).toContainText("title")
    await expect(codeEditorAfter.locator(".cm-editor")).toContainText(
      "My Document"
    )

    // =========================================================================
    // Test 4: Delete frontmatter and create via slash command
    // =========================================================================
    await window.getByTestId("block-delete-button").click()
    await expect(window.getByTestId("frontmatter-node")).not.toBeVisible()

    // Create frontmatter via slash command
    await editor.click()
    await editor.pressSequentially("/frontmatter")

    // Wait for slash command menu and select frontmatter
    await window.waitForTimeout(200)
    await window.keyboard.press("Enter")

    // Verify frontmatter is created (slash command also starts in code view)
    await expect(window.getByTestId("frontmatter-node")).toBeVisible()
    await expect(window.getByTestId("frontmatter-code-editor")).toBeVisible()
  })

  test("open markdown file with existing frontmatter renders table", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // Create a markdown file with frontmatter
    const filePath = path.join(tempTestDir, "with-frontmatter.md")
    fs.writeFileSync(
      filePath,
      `---
name: test-document
version: 1.0.0
---

# Hello World

Some content here.
`
    )

    await waitForWorkspace(window)

    // Open the file
    await window
      .getByRole("button", { name: "with-frontmatter.md" })
      .first()
      .click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // Frontmatter from file should render in table view by default
    await expect(window.getByTestId("frontmatter-node")).toBeVisible()
    await expect(window.getByTestId("frontmatter-table")).toBeVisible()

    // Verify property names appear in the table
    const table = window.getByTestId("frontmatter-table")
    await expect(table).toContainText("name")
    await expect(table).toContainText("test-document")
    await expect(table).toContainText("version")
    await expect(table).toContainText("1.0.0")
  })
})
