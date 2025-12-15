import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("mermaid e2e", () => {
  test("open markdown file and render mermaid diagram", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy mermaid.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/mermaid.md")
    const destPath = path.join(tempTestDir, "mermaid.md")
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
    await window.getByRole("button", { name: "mermaid.md" }).first().click()

    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify markdown header is parsed correctly
    await expect(
      window.getByRole("heading", {
        name: "Mermaid Diagram Test",
      })
    ).toBeVisible()

    // verify that the mermaid diagram is rendered as an svg
    // mermaid diagrams are rendered inside a div with the class "mermaid"
    await expect(window.locator("div.mermaid-container > svg")).toBeVisible()
  })
})
