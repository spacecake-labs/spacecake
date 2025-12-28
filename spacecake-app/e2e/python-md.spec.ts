import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("python markdown directives e2e", () => {
  test("markdown directives are properly formatted and editable", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy md.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/md.py")
    const destPath = path.join(tempTestDir, "md.py")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window.getByRole("button", { name: "md.py" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify the markdown content is properly formatted
    // the header should be a proper heading element, not just text
    const headerElement = window
      .getByRole("heading", { name: "a header" })
      .first()
    await expect(headerElement).toBeVisible()

    // verify the subheader is also properly formatted
    const subheaderElement = window
      .getByRole("heading", { name: "a subheader" })
      .first()
    await expect(subheaderElement).toBeVisible()

    // verify the paragraph is properly formatted
    const paragraphElement = window.getByText("a paragraph").first()
    await expect(paragraphElement).toBeVisible()

    // test that we can edit the markdown content
    // click on the header to focus it
    await headerElement.click()

    // type some new content
    await window.keyboard.type(" updated", { delay: 100 })

    // verify the change appears
    await expect(window.getByText("a header updated").first()).toBeVisible()

    // save the file
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    // verify the change persists after save
    await expect(window.getByText("a header updated").first()).toBeVisible()
  })

  test("delete a code block from a python markdown file", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy md.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/md.py")
    const destPath = path.join(tempTestDir, "md.py")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window.getByRole("button", { name: "md.py" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // find the import code block
    const importBlock = window.locator('[data-block-id="anonymous-import"]')
    await expect(importBlock).toBeVisible()

    // click the delete button within this specific block
    await importBlock.getByTestId("block-delete-button").click()

    // verify the import block is gone
    await expect(importBlock).not.toBeVisible()
  })
})
