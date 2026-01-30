import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

test.describe("markdown e2e", () => {
  test("open workspace and render _README.md blocks", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, destPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await locateSidebarItem(window, "_README.md").click()

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

    // test deleting a code block
    const codeBlockToDelete = window
      .locator(".cm-editor")
      .getByText('print("Hello, world!")')
      .first()

    // click the delete button
    await window.getByTestId("block-delete-button").first().click()

    // verify the code block is gone
    await expect(codeBlockToDelete).not.toBeVisible()
  })
})
