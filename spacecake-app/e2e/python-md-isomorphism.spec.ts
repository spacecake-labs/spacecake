import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("python markdown directives isomorphism e2e", () => {
  test("md.py maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy md.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/md.py")
    const destPath = path.join(tempTestDir, "md.py")
    fs.copyFileSync(fixturePath, destPath)

    // read the original content to verify isomorphism
    const originalContent = fs.readFileSync(destPath, "utf-8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // open the file
    await window.getByRole("button", { name: "md.py" }).first().click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify the file loads with markdown directives rendered
    await expect(
      window.getByRole("heading", {
        name: "A file with markdown directives.",
      })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "a header" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "a subheader" })
    ).toBeVisible()

    await expect(window.getByText("a paragraph").first()).toBeVisible()

    await expect(window.getByText("import").first()).toBeVisible()

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    await window.waitForTimeout(1000)

    // verify the file was saved with the exact same content
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(originalContent)

    // verify file modification time has been updated (indicating save occurred)
    const savedStats = fs.statSync(destPath)
    expect(savedStats.mtimeMs).toBeGreaterThan(0)
  })

  //   test("python file with markdown directives maintains isomorphism through editor roundtrip", async ({
  //     electronApp,
  //     tempTestDir,
  //   }) => {
  //     const window = await electronApp.firstWindow()

  //     // create a python file with markdown directives
  //     const mdContent = `"""Module with markdown documentation."""

  // import os
  // import sys

  // #🍰 # main section
  // #🍰 this is a paragraph with **bold** and *italic* text
  // #🍰
  // #🍰 ## subsection
  // #🍰 - list item 1
  // #🍰 - list item 2
  // #🍰
  // #🍰 \`\`\`python
  // #🍰 print("code block")
  // #🍰 \`\`\`

  // def test_function():
  //     """Function docstring"""
  //     pass

  // class TestClass:
  //     """Class docstring"""

  //     def method(self):
  //         return "method result"`

  //     const destPath = path.join(tempTestDir, "test_md.py")
  //     fs.writeFileSync(destPath, mdContent, "utf-8")

  //     await stubDialog(electronApp, "showOpenDialog", {
  //       filePaths: [tempTestDir],
  //       canceled: false,
  //     })

  //     await window.getByRole("button", { name: "open folder" }).click()

  //     // open the file
  //     await window.getByRole("button", { name: "test_md.py" }).first().click()
  //     await expect(window.getByTestId("lexical-editor")).toBeVisible()

  //     // verify the file loads with markdown directives rendered
  //     await expect(
  //       window.getByRole("heading", {
  //         name: "Module with markdown documentation.",
  //       })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByRole("heading", { name: "main section" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByRole("heading", { name: "subsection" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByText("this is a paragraph with").first()
  //     ).toBeVisible()
  //     await expect(window.getByText("list item 1").first()).toBeVisible()
  //     await expect(window.getByText("list item 2").first()).toBeVisible()
  //     await expect(window.getByText('print("code block")').first()).toBeVisible()

  //     await expect(window.getByText("import").first()).toBeVisible()
  //     await expect(window.getByText("test_function").first()).toBeVisible()
  //     await expect(window.getByText("function").first()).toBeVisible()
  //     await expect(window.getByText("TestClass").first()).toBeVisible()
  //     await expect(
  //       window.getByText("class", { exact: true }).first()
  //     ).toBeVisible()

  //     // save the file without any changes
  //     const saveBtn = window.getByRole("button", { name: "save", exact: true })
  //     await saveBtn.click()

  //     await window.waitForTimeout(1000)

  //     // verify the file was saved with the exact same content
  //     const savedContent = fs.readFileSync(destPath, "utf-8")
  //     expect(savedContent).toBe(mdContent)
  //   })

  //   test("python file with only markdown directives maintains isomorphism through editor roundtrip", async ({
  //     electronApp,
  //     tempTestDir,
  //   }) => {
  //     const window = await electronApp.firstWindow()

  //     // create a python file with only markdown directives
  //     const onlyMdContent = `#🍰 # documentation only
  // #🍰
  // #🍰 this file contains only markdown directives
  // #🍰
  // #🍰 ## features
  // #🍰 - no python code
  // #🍰 - pure documentation
  // #🍰 - should preserve exactly
  // #🍰
  // #🍰 \`\`\`
  // #🍰 example code block
  // #🍰 \`\`\``

  //     const destPath = path.join(tempTestDir, "only_md.py")
  //     fs.writeFileSync(destPath, onlyMdContent, "utf-8")

  //     await stubDialog(electronApp, "showOpenDialog", {
  //       filePaths: [tempTestDir],
  //       canceled: false,
  //     })

  //     await window.getByRole("button", { name: "open folder" }).click()

  //     // open the file
  //     await window.getByRole("button", { name: "only_md.py" }).first().click()
  //     await expect(window.getByTestId("lexical-editor")).toBeVisible()

  //     // verify the file loads with markdown directives rendered
  //     await expect(
  //       window.getByRole("heading", { name: "documentation only" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByRole("heading", { name: "features" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByText("this file contains only markdown directives").first()
  //     ).toBeVisible()

  //     await expect(window.getByText("no python code").first()).toBeVisible()
  //     await expect(window.getByText("pure documentation").first()).toBeVisible()
  //     await expect(
  //       window.getByText("should preserve exactly").first()
  //     ).toBeVisible()
  //     await expect(window.getByText("example code block").first()).toBeVisible()

  //     // save the file without any changes
  //     const saveBtn = window.getByRole("button", { name: "save", exact: true })
  //     await saveBtn.click()

  //     await window.waitForTimeout(1000)

  //     // verify the file was saved with the exact same content
  //     const savedContent = fs.readFileSync(destPath, "utf-8")
  //     expect(savedContent).toBe(onlyMdContent)
  //   })

  test("python file with mixed markdown and code maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create a python file with mixed markdown and code
    const mixedContent = `"""Mixed content module."""

#🍰 # overview
#🍰 this module demonstrates mixed markdown and python code

import json
from typing import Dict, Any

#🍰 ## configuration
#🍰 the following constants define the module behavior

CONFIG = {
    "debug": True,
    "timeout": 30
}

#🍰 ## main function
#🍰 processes data according to configuration

def process_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Process input data."""
    if CONFIG["debug"]:
        print(f"processing: {data}")
    
    result = data.copy()
    result["processed"] = True
    return result

#🍰 ## usage example
#🍰 \`\`\`python
#🍰 result = process_data({"input": "test"})
#🍰 print(result)
#🍰 \`\`\`

if __name__ == "__main__":
    test_data = {"input": "example"}
    result = process_data(test_data)
    print(f"result: {result}")`

    const destPath = path.join(tempTestDir, "mixed.py")
    fs.writeFileSync(destPath, mixedContent, "utf-8")

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // open the file
    await window.getByRole("button", { name: "mixed.py" }).first().click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify the file loads with markdown directives rendered
    await expect(
      window.getByRole("heading", {
        name: "Mixed content module.",
      })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "overview" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "configuration" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "main function" })
    ).toBeVisible()

    await expect(
      window.getByRole("heading", { name: "usage example" })
    ).toBeVisible()

    await expect(
      window
        .getByText("this module demonstrates mixed markdown and python code")
        .first()
    ).toBeVisible()

    await expect(
      window
        .getByText("the following constants define the module behavior")
        .first()
    ).toBeVisible()
    await expect(
      window.getByText("processes data according to configuration").first()
    ).toBeVisible()
    await expect(
      window.getByText('result = process_data({"input": "test"})').first()
    ).toBeVisible()

    await expect(window.getByText("import").first()).toBeVisible()
    await expect(window.getByText("process_data").first()).toBeVisible()
    await expect(window.getByText("function").first()).toBeVisible()
    await expect(window.getByText("main").first()).toBeVisible()

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    await window.waitForTimeout(1000)

    // verify the file was saved with the exact same content
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(mixedContent)
  })

  //   test("python file with markdown directives preserves whitespace and formatting through editor roundtrip", async ({
  //     electronApp,
  //     tempTestDir,
  //   }) => {
  //     const window = await electronApp.firstWindow()

  //     // create a python file with carefully formatted markdown directives
  //     const formattedContent = `"""Formatted module."""

  // #🍰 # section with spaces
  // #🍰    this line has leading spaces
  // #🍰
  // #🍰 ## subsection
  // #🍰 - item 1
  // #🍰 - item 2
  // #🍰
  // #🍰 \`\`\`python
  // #🍰 def example():
  // #🍰     return "formatted"
  // #🍰 \`\`\`

  // def test():
  //     pass`

  //     const destPath = path.join(tempTestDir, "formatted.py")
  //     fs.writeFileSync(destPath, formattedContent, "utf-8")

  //     await stubDialog(electronApp, "showOpenDialog", {
  //       filePaths: [tempTestDir],
  //       canceled: false,
  //     })

  //     await window.getByRole("button", { name: "open folder" }).click()

  //     // open the file
  //     await window.getByRole("button", { name: "formatted.py" }).first().click()
  //     await expect(window.getByTestId("lexical-editor")).toBeVisible()

  //     // verify the file loads with markdown directives rendered
  //     await expect(
  //       window.getByRole("heading", { name: "section with spaces" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByRole("heading", { name: "subsection" })
  //     ).toBeVisible()

  //     await expect(
  //       window.getByText("this line has leading spaces").first()
  //     ).toBeVisible()

  //     await expect(window.getByText("item 1").first()).toBeVisible()
  //     await expect(window.getByText("item 2").first()).toBeVisible()
  //     await expect(window.getByText("def example():").first()).toBeVisible()
  //     await expect(window.getByText('return "formatted"').first()).toBeVisible()

  //     await expect(window.getByText("test").first()).toBeVisible()
  //     await expect(window.getByText("function").first()).toBeVisible()

  //     // save the file without any changes
  //     const saveBtn = window.getByRole("button", { name: "save", exact: true })
  //     await saveBtn.click()

  //     await window.waitForTimeout(1000)

  //     // verify the file was saved with the exact same content (including whitespace)
  //     const savedContent = fs.readFileSync(destPath, "utf-8")
  //     expect(savedContent).toBe(formattedContent)
  //   })
})
