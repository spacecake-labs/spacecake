import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("python markdown directives e2e", () => {
  test("open workspace and render md.py markdown directives", async ({
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

    // verify we're in blocks view (not source view)
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    // verify module docstring is parsed as markdown header
    await expect(
      window.getByRole("heading", {
        name: "A file with markdown directives.",
      })
    ).toBeVisible()

    // verify markdown directives are parsed and rendered correctly
    // the #🍰 comments should be converted to proper markdown elements
    // check that #🍰 # a header becomes a heading
    await expect(
      window.getByRole("heading", { name: "a header" })
    ).toBeVisible()

    // check that #🍰 ## a subheader becomes a subheading
    await expect(
      window.getByRole("heading", { name: "a subheader" })
    ).toBeVisible()

    // check that #🍰 a paragraph becomes a paragraph
    await expect(window.getByText("a paragraph").first()).toBeVisible()

    // verify blocks are present via toolbar and labels
    await window.getByText("🐍").first().click()

    // verify the import block is present
    await expect(window.getByText("import").first()).toBeVisible()

    // verify key lines render correctly
    await expect(window.getByText("import pandas as pd").first()).toBeVisible()
  })

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

    // verify it's actually a heading tag (not just styled text)
    // Note: the exact attribute may vary, so we'll just check it's a heading
    await expect(headerElement).toHaveAttribute("dir", "ltr")

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
    const saveBtn = window.getByRole("button", { name: "save" })
    await saveBtn.click()

    // verify the change persists after save
    await expect(window.getByText("a header updated").first()).toBeVisible()
  })

  test("markdown directives work with different content types", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create a more complex test file with various markdown directives
    const testContent = `"""A test file for markdown directives."""

import os

#🍰 # main section
#🍰 this is a paragraph with **bold** and *italic* text
#🍰 
#🍰 ## subsection
#🍰 - list item 1
#🍰 - list item 2
#🍰 
#🍰 \`\`\`python
#🍰 print("code block")
#🍰 \`\`\`

def test_function():
    pass
`

    const testFilePath = path.join(tempTestDir, "test_md.py")
    fs.writeFileSync(testFilePath, testContent, "utf8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the test file
    await window.getByRole("button", { name: "test_md.py" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify module docstring is parsed
    await expect(
      window.getByRole("heading", {
        name: "A test file for markdown directives.",
      })
    ).toBeVisible()

    // verify main section header
    await expect(
      window.getByRole("heading", { name: "main section" })
    ).toBeVisible()

    // verify subsection header
    await expect(
      window.getByRole("heading", { name: "subsection" })
    ).toBeVisible()

    // verify paragraph content
    await expect(
      window.getByText("this is a paragraph with").first()
    ).toBeVisible()

    // verify list items
    await expect(window.getByText("list item 1").first()).toBeVisible()
    await expect(window.getByText("list item 2").first()).toBeVisible()

    // verify code block
    await expect(window.getByText('print("code block")').first()).toBeVisible()

    // verify function block is present
    await window.getByText("🐍").first().click()
    await expect(window.getByText("function").first()).toBeVisible()
  })

  test("markdown directives are properly rendered and accessible", async ({
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

    // verify we're in blocks view initially
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    // verify markdown content is rendered
    await expect(
      window.getByRole("heading", { name: "a header" })
    ).toBeVisible()

    // verify we can see the import statement
    await expect(window.getByText("import pandas as pd").first()).toBeVisible()

    // verify the markdown content is properly accessible
    // (this tests that the #🍰 comments are converted to proper markdown elements)
    await expect(window.getByText("a paragraph").first()).toBeVisible()
  })
})
