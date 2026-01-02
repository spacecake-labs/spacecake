import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("ghostty terminal", () => {
  test("toggle terminal visibility and interact with terminal", async ({
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
    await expect(window.getByTestId("ghostty-terminal")).toBeVisible()

    // Test: Hide the terminal
    const hideButton = window.getByRole("button", { name: "hide terminal" })
    await expect(hideButton).toBeVisible()
    await hideButton.click()

    // Verify the terminal is now hidden
    await expect(window.getByTestId("ghostty-terminal")).not.toBeVisible()

    // Test: Show the terminal again
    const showButton = window.getByRole("button", { name: "show terminal" })
    await expect(showButton).toBeVisible()
    await showButton.click()

    const terminalElement = window.getByTestId("ghostty-terminal")

    // verify the terminal is now visible
    await expect(terminalElement).toBeVisible()
    // wait for shell profile to be loaded (shell integration complete)
    await expect(
      window.getByRole("status", { name: "shell profile loaded" })
    ).toBeVisible()

    // Test: Click into the terminal and type echo command

    await terminalElement.click()

    // Type echo command to test terminal interaction
    const testText = "hello spacecake"
    await window.keyboard.type(`echo ${testText}`, { delay: 50 })
    await window.keyboard.press("Enter")

    // Wait a bit for the command to execute and output to appear
    await window.waitForTimeout(500)

    // Check if our test text appears in the terminal output using the terminal API
    const terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("\n") as string | undefined
    })
    expect(terminalContent).toContain(testText)
  })
})
