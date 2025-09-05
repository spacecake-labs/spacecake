import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("route not found", () => {
  test("should show 'not found' message when workspace path does not exist", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // delete the workspace directory
    fs.rmSync(tempTestDir, { recursive: true, force: true, maxRetries: 5 })

    await window.reload()

    // expect error message to be visible
    await expect(
      window.getByText(`workspace not found:\n${tempTestDir}`)
    ).toBeVisible()

    // expect 'open folder' button to be visible again
    await expect(
      window.getByRole("button", { name: "open folder" })
    ).toBeVisible()
  })

  test("should show 'file not found' message when file is deleted after opening", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const testFilePath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, testFilePath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await window.getByRole("button", { name: "_README.md" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // delete the file (not the directory)
    fs.unlinkSync(testFilePath)

    await window.reload()

    await window.waitForTimeout(5000)

    // expect file not found error message to be visible
    await expect(
      window.getByText(`file not found:\n${testFilePath}`)
    ).toBeVisible()
  })
})
