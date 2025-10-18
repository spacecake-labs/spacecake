import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("selection restoration", () => {
  test("should restore selection in a markdown file on save", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create the markdown file on disk first
    const mdContent = `one three`
    const testFilePath = path.join(tempTestDir, "test-selection.md")
    fs.writeFileSync(testFilePath, mdContent, "utf8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
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

    // create the markdown file on disk first
    const mdContent = `one three`
    const testFilePath = path.join(tempTestDir, "test-selection-reload.md")
    fs.writeFileSync(testFilePath, mdContent, "utf8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "test-selection-reload.md" })
      .first()
      .click()

    // Explicitly wait for the Lexical editor to be visible
    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // click on 'three' and move cursor to be between 'one' and 'three'
    await editor.getByText("three").click({ delay: 100 })
    await window.keyboard.press("ArrowLeft", { delay: 100 })

    // give it a moment to save the state
    await window.waitForTimeout(2000)

    // reload the window
    await window.reload()

    // wait for editor to be visible again
    const editorAfterReload = window.getByTestId("lexical-editor")
    await expect(editorAfterReload).toBeVisible()

    await window.keyboard.type("two ", { delay: 100 })

    await expect(editorAfterReload.getByText("one two three")).toBeVisible()
  })
})
