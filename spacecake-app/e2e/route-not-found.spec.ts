import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"

test.describe("route not found", () => {
  test("should show 'workspace not accessible' message when workspace has no read permissions", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // open the temp test directory as workspace (via SPACECAKE_HOME env var)
    await waitForWorkspace(window)

    // wait for watcher to be ready
    await window.waitForTimeout(1000)

    // remove read permissions from the workspace
    fs.chmodSync(tempTestDir, 0o000)

    try {
      // reload the window - this should trigger the permission denied error
      await window.reload()

      // verify the "workspace not accessible" message appears
      await expect(
        window.getByText(`workspace not accessible:\n${tempTestDir}`)
      ).toBeVisible({ timeout: 10000 })
    } finally {
      // always restore permissions for cleanup
      fs.chmodSync(tempTestDir, 0o755)
    }
  })

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
