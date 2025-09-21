import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("markdown isomorphism e2e", () => {
  test("README.md maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // open the file
    await window.getByRole("button", { name: "_README.md" }).first().click()

    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify markdown header is parsed correctly
    await expect(
      window.getByRole("heading", {
        name: "An Example README File to Test Parsing",
      })
    ).toBeVisible()

    // verify subheadings are present
    await expect(
      window.getByRole("heading", { name: "Features" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "Code Blocks" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "Contributing" })
    ).toBeVisible()

    await expect(window.getByRole("heading", { name: "Authors" })).toBeVisible()

    await expect(window.getByRole("heading", { name: "Used By" })).toBeVisible()

    // verify code block content is present in CodeMirror editor
    const codeBlock = window
      .locator(".cm-editor")
      .getByText('print("Hello, world!")')
      .first()

    await expect(codeBlock).toBeVisible()

    await expect(
      window.getByRole("img", { name: "Build Status" })
    ).toBeVisible()

    // verify list items are present
    await expect(
      window.getByText("Light/dark mode toggle").first()
    ).toBeVisible()
    await expect(window.getByText("Live previews").first()).toBeVisible()
    await expect(window.getByText("Fullscreen mode").first()).toBeVisible()
    await expect(window.getByText("Cross platform").first()).toBeVisible()

    // verify links are present
    await expect(
      window.getByRole("link", { name: "MIT License" })
    ).toBeVisible()
    await expect(
      window.getByRole("link", { name: "@spacecake-labs" })
    ).toBeVisible()
    await expect(window.getByRole("link", { name: "readme.so" })).toBeVisible()

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save" })
    await saveBtn.click()

    // verify file modification time has been updated (indicating save occurred)
    const savedStats = fs.statSync(destPath)
    expect(savedStats.mtimeMs).toBeGreaterThan(0)

    // verify the file was saved with the exact same content
    const originalContent = fs.readFileSync(fixturePath, "utf-8")
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(originalContent)
  })
})
