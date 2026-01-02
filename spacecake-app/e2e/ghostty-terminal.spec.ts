import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("ghostty terminal", () => {
  test("toggle terminal visibility, interact with terminal, and verify session management", async ({
    electronApp,
    tempTestDir,
  }) => {
    // Setup: Create a test file
    const testFilePath = path.join(tempTestDir, "test.md")
    fs.writeFileSync(testFilePath, "# test file")

    const window = await electronApp.firstWindow()

    // Open the workspace
    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    // Wait for workspace to load
    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // Open the test file to get to the workspace route
    await window.getByRole("button", { name: "test.md" }).click()

    // Wait for the editor to be visible
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // Verify the terminal is initially visible (not collapsed)
    const terminalElement = window.getByTestId("ghostty-terminal")
    await expect(terminalElement).toBeVisible()

    // Wait for shell profile to be loaded (shell integration complete)
    await expect(
      window.getByRole("status", { name: "shell profile loaded" })
    ).toBeVisible()

    const hideButton = window.getByRole("button", { name: "hide terminal" })
    const showButton = window.getByRole("button", { name: "show terminal" })
    const deleteButton = window.getByTestId("terminal-delete-button")

    // Test: Hide and show terminal (toggle visibility)
    await hideButton.click()
    await expect(terminalElement).not.toBeVisible()
    await showButton.click()
    await expect(terminalElement).toBeVisible()

    // Test: Interact with terminal - set a variable and verify CWD
    await terminalElement.click()
    await window.keyboard.type("export TEST_VAR=123 && pwd", { delay: 50 })
    await window.keyboard.press("Enter")

    let terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("\n") as string | undefined
    })
    // Verify both CWD and command executed
    expect(terminalContent).toContain(path.basename(tempTestDir))

    // Test: Hide (collapse) and show again -> should be SAME session
    await hideButton.click()
    await expect(terminalElement).not.toBeVisible()
    await showButton.click()
    await expect(terminalElement).toBeVisible()

    // Verify variable still exists (same session)
    await terminalElement.click()
    await window.keyboard.type("echo $TEST_VAR", { delay: 50 })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("\n") as string | undefined
    })
    expect(terminalContent).toContain("123")

    // Test: Delete terminal -> creates new session, variable is gone
    await deleteButton.click()
    await expect(terminalElement).not.toBeVisible()

    await showButton.click()
    await expect(terminalElement).toBeVisible()
    await expect(
      window.getByRole("status", { name: "shell profile loaded" })
    ).toBeVisible()

    // Verify it's a new session (variable is gone)
    await terminalElement.click()
    await window.keyboard.type("echo $TEST_VAR", { delay: 50 })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("\n") as string | undefined
    })
    expect(terminalContent).not.toContain("123")
  })
})
