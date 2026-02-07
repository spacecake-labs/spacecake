import { execSync } from "child_process"
import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

/** Normalize path to forward slashes (matches how the UI displays paths) */
const normalizePath = (p: string) => p.replace(/\\/g, "/")

const isWindows = process.platform === "win32"

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

    if (isWindows) {
      // Windows: use icacls to deny all access to Everyone
      execSync(`icacls "${tempTestDir}" /deny Everyone:(OI)(CI)F`, { stdio: "ignore" })
    } else {
      // Unix: remove all permissions
      fs.chmodSync(tempTestDir, 0o000)
    }

    try {
      // reload the window - this should trigger the permission denied error
      await window.reload()

      // verify the "workspace not accessible" message appears
      // Use normalized path because the UI normalizes paths to forward slashes
      await expect(
        window.getByText(`workspace not accessible:\n${normalizePath(tempTestDir)}`),
      ).toBeVisible({
        timeout: 10000,
      })
    } finally {
      // always restore permissions for cleanup
      if (isWindows) {
        execSync(`icacls "${tempTestDir}" /grant Everyone:(OI)(CI)F`, { stdio: "ignore" })
      } else {
        fs.chmodSync(tempTestDir, 0o755)
      }
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

    await locateSidebarItem(window, "_README.md").click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await window.waitForTimeout(1000)

    await expect(
      window.getByRole("heading", {
        name: "An Example README File to Test Parsing",
      }),
    ).toBeVisible()

    // delete the file (not the directory)
    fs.unlinkSync(testFilePath)

    await window.reload()

    // Use normalized path because the UI normalizes paths to forward slashes
    await expect(window.getByText(`file not found:\n${normalizePath(testFilePath)}`)).toBeVisible()
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

    // Stop the watcher before deleting to release file handles (required on Windows)
    await window.evaluate((watchPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).electronAPI.stopWatcher(watchPath)
    }, tempTestDir)

    // delete the workspace directory
    fs.rmSync(tempTestDir, { recursive: true, force: true })

    // reload the window - this should trigger the workspace not found error
    await window.reload()

    // Use normalized path because the UI normalizes paths to forward slashes
    await expect(
      window.getByText(`workspace not found:\n${normalizePath(tempTestDir)}`),
    ).toBeVisible()
  })
})
