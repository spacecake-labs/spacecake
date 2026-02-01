import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

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
    await waitForWorkspace(window)

    // Open the test file to get to the workspace route
    await locateSidebarItem(window, "test.md").click()

    // Wait for the editor to be visible
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    const terminalElement = window.getByTestId("ghostty-terminal")
    const terminalToggle = window.getByTestId("statusbar-terminal-toggle")

    // Terminal starts expanded by default
    await expect(terminalElement).toBeVisible()

    // Wait for shell profile to be loaded (shell integration complete)
    await expect(window.getByRole("status", { name: "shell profile loaded" })).toBeVisible()
    const deleteButton = window.getByTestId("terminal-delete-button")

    // Test: Hide and show terminal (toggle visibility)
    await terminalToggle.click()
    await expect(terminalElement).not.toBeVisible()
    await terminalToggle.click()
    await expect(terminalElement).toBeVisible()

    // Test: Cmd+1 / Ctrl+1 focuses editor from terminal
    // Focus the terminal textarea directly (xterm uses textarea for keyboard input)
    await terminalElement.locator("textarea").focus()
    await window.waitForTimeout(100)
    // Verify terminal has focus
    await expect(terminalElement.locator("textarea")).toBeFocused()
    // Press Cmd+1 (Mac) or Ctrl+1 (Linux/Windows) to focus editor
    await window.keyboard.press("ControlOrMeta+1")
    await window.waitForTimeout(100)
    // Verify editor now has focus (contenteditable inside lexical-editor)
    const editorContentEditable = window
      .getByTestId("lexical-editor")
      .locator("[contenteditable='true']")
    await expect(editorContentEditable).toBeFocused()

    // Test: Ctrl+` when editor focused + terminal expanded → focus terminal
    await expect(editorContentEditable).toBeFocused()
    await expect(terminalElement).toBeVisible()
    await window.keyboard.press("Control+`")
    await window.waitForTimeout(100)
    await expect(terminalElement.locator("textarea")).toBeFocused()

    // Test: Ctrl+` when terminal focused + expanded → collapse terminal
    await expect(terminalElement.locator("textarea")).toBeFocused()
    await window.keyboard.press("Control+`")
    await window.waitForTimeout(100)
    await expect(terminalElement).not.toBeVisible()

    // Test: Ctrl+` when editor focused + terminal collapsed → expand AND focus terminal
    await editorContentEditable.click()
    await window.waitForTimeout(100)
    await expect(editorContentEditable).toBeFocused()
    await expect(terminalElement).not.toBeVisible()
    await window.keyboard.press("Control+`")
    await window.waitForTimeout(200)
    await expect(terminalElement).toBeVisible()
    await expect(terminalElement.locator("textarea")).toBeFocused()

    // Test: Interact with terminal - set a variable and verify CWD
    await terminalElement.locator("textarea").focus()
    await window.waitForTimeout(100)
    await window.keyboard.type("export TEST_VAR=123 && pwd", { delay: 50 })
    await window.keyboard.press("Enter")

    let terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    // Verify both CWD and command executed (join without newlines to handle line-wrapping)
    expect(terminalContent).toContain(path.basename(tempTestDir))

    // Test: Hide (collapse) and show again -> should be SAME session
    await terminalToggle.click()
    await expect(terminalElement).not.toBeVisible()
    await terminalToggle.click()
    await expect(terminalElement).toBeVisible()

    // Verify variable still exists (same session)
    await terminalElement.locator("textarea").focus()
    await window.waitForTimeout(100)
    await window.keyboard.type("echo $TEST_VAR", { delay: 50 })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    expect(terminalContent).toContain("123")

    // Test: kill terminal -> creates new session, variable is gone
    await deleteButton.click()
    await expect(terminalElement).not.toBeVisible()

    await terminalToggle.click()
    await expect(terminalElement).toBeVisible()
    await expect(window.getByRole("status", { name: "shell profile loaded" })).toBeVisible()

    // Verify it's a new session (variable is gone)
    // Use a marker command to distinguish the output - echo the variable with a prefix
    // If the variable is unset, we'll see just the prefix; if set, we'll see prefix+value
    await terminalElement.locator("textarea").focus()
    await window.waitForTimeout(100)
    await window.keyboard.type("echo MARKER:$TEST_VAR:END", { delay: 50 })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    // In a new session, the variable should be empty, so we expect MARKER::END
    // We're explicitly checking for MARKER::END which proves the variable is not set
    expect(terminalContent).toContain("MARKER::END")
  })
})
