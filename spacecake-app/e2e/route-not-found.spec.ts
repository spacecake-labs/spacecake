import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("route not found", () => {
  test("should show 'file not found' message when file is deleted after opening", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const testFilePath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, testFilePath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    await window.getByRole("button", { name: "_README.md" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await window.waitForTimeout(1000)

    await expect(
      window.getByRole("heading", {
        name: "An Example README File to Test Parsing",
      })
    ).toBeVisible()

    // delete the file (not the directory)
    fs.unlinkSync(testFilePath)

    await window.reload()

    await expect(
      window.getByText(`file not found:\n${testFilePath}`)
    ).toBeVisible()
  })

  test("should show 'workspace not found' message when workspace path does not exist", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // wait for watcher to be ready
    await window.waitForTimeout(1000)

    // delete the workspace directory
    fs.rmSync(tempTestDir, { recursive: true, force: true, maxRetries: 5 })

    // isn't necessary for mac (FSEvents)
    // but may be necessary for some of the watcher backends
    await window.reload()

    await expect(
      window.getByText(`workspace not found:\n${tempTestDir}`)
    ).toBeVisible()
  })
})
