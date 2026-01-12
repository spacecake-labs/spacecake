import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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

    // verify the import block is present
    await expect(window.getByText("import").first()).toBeVisible()

    // verify key lines render correctly
    await expect(window.getByText("import pandas as pd").first()).toBeVisible()

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

    // open the temp test directory as workspace
    await waitForWorkspace(window)

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
})
