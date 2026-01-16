import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"

test.describe("selection restoration", () => {
  test("should restore selection in a markdown file on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // Wait for initial home folder load to complete
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // create the markdown file on disk first
    const mdContent = `one three`
    const testFilePath = path.join(tempTestDir, "test-selection.md")
    fs.writeFileSync(testFilePath, mdContent, "utf8")

    // open the temp test directory as workspace (triggers file tree refresh)
    await waitForWorkspace(window)

    // Wait for test file to appear
    await expect(
      window.getByRole("button", { name: "test-selection.md" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "test-selection.md" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // click on 'three' and move cursor to be between 'one' and 'three'
    await editor.getByText("three").click({ delay: 100 })
    await window.keyboard.press("ArrowLeft", { delay: 100 })

    // save the file
    await window.keyboard.press("ControlOrMeta+s", { delay: 300 })

    await expect(editor).toBeVisible()

    await window.keyboard.type("two ", { delay: 100 })

    await expect(editor.getByText("one two three")).toBeVisible()
  })

  test("should restore selection in a markdown file on reload", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // Wait for initial home folder load to complete
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // create the markdown file on disk first
    const mdContent = `one three`
    const testFilePath = path.join(tempTestDir, "test-selection-reload.md")
    fs.writeFileSync(testFilePath, mdContent, "utf8")

    // open the temp test directory as workspace (triggers file tree refresh)
    await waitForWorkspace(window)

    // Wait for the test file to appear in file tree
    await expect(
      window.getByRole("button", { name: "test-selection-reload.md" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "test-selection-reload.md" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible with our content
    const editor = window.getByTestId("lexical-editor")
    await expect(editor.getByText("one three")).toBeVisible()

    // click on 'three' and move cursor to be between 'one' and 'three'
    await editor.getByText("three").click({ delay: 100 })
    await window.keyboard.press("ArrowLeft", { delay: 100 })

    // give it a moment to save the state
    await window.waitForTimeout(2000)

    // reload the window
    await window.reload()

    // Wait for workspace to restore
    await expect(
      window.getByRole("button", { name: "test-selection-reload.md" })
    ).toBeVisible()

    // wait for editor to be visible again with our content (file should auto-restore)
    const editorAfterReload = window.getByTestId("lexical-editor")
    await expect(editorAfterReload.getByText("one three")).toBeVisible()

    // Wait for selection/cursor restoration to complete (async after content renders)
    await window.waitForTimeout(1000)

    // Type - if cursor position was restored, this should produce "one two three"
    await window.keyboard.type("two ", { delay: 100 })

    await expect(editorAfterReload.getByText("one two three")).toBeVisible()
  })
})
