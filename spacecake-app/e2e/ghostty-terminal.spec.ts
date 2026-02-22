import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

const isWindows = process.platform === "win32"

// Windows CMD needs more time between keystrokes to avoid dropping characters
const typeDelay = isWindows ? 100 : 50

// Platform-specific shell commands
const shell = {
  // Set environment variable and print current directory
  setVarAndPwd: isWindows ? "set TEST_VAR=123 & cd" : "export TEST_VAR=123 && pwd",
  // Echo the variable
  echoVar: isWindows ? "echo %TEST_VAR%" : "echo $TEST_VAR",
  // Echo with marker to detect if variable is set
  echoMarker: isWindows ? "echo MARKER:%TEST_VAR%:END" : "echo MARKER:$TEST_VAR:END",
  // Expected output when variable is unset (empty between markers)
  markerUnset: isWindows ? "MARKER:%TEST_VAR%:END" : "MARKER::END",
}

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

    const terminalPanel = window.getByTestId("terminal-panel")
    // in multi-tab, the first visible ghostty-terminal is the active tab's mount point
    const terminalElement = terminalPanel.getByTestId("ghostty-terminal").first()
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
    // Focus the terminal textarea directly (ghostty uses textarea for keyboard input)
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

    // Test: Ctrl+` when editor focused + terminal expanded -> focus terminal
    await expect(editorContentEditable).toBeFocused()
    await expect(terminalElement).toBeVisible()
    await window.keyboard.press("Control+`")
    await window.waitForTimeout(100)
    await expect(terminalElement.locator("textarea")).toBeFocused()

    // Test: Ctrl+` when terminal focused + expanded -> collapse terminal
    await expect(terminalElement.locator("textarea")).toBeFocused()
    await window.keyboard.press("Control+`")
    await window.waitForTimeout(100)
    await expect(terminalElement).not.toBeVisible()

    // Test: Ctrl+` when editor focused + terminal collapsed -> expand AND focus terminal
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
    await window.keyboard.type(shell.setVarAndPwd, { delay: typeDelay })
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
    await window.keyboard.type(shell.echoVar, { delay: typeDelay })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    expect(terminalContent).toContain("123")

    // Test: kill terminal -> destroys all tabs, creates new session on re-expand
    await deleteButton.click()
    await expect(terminalPanel).not.toBeVisible()

    await terminalToggle.click()
    await expect(terminalPanel).toBeVisible()
    await expect(window.getByRole("status", { name: "shell profile loaded" })).toBeVisible()

    // Verify it's a new session (variable is gone)
    // Use a marker command to distinguish the output - echo the variable with a prefix
    // If the variable is unset, we'll see just the prefix; if set, we'll see prefix+value
    const freshTerminal = terminalPanel.getByTestId("ghostty-terminal").first()
    await freshTerminal.locator("textarea").focus()
    await window.waitForTimeout(100)
    await window.keyboard.type(shell.echoMarker, { delay: typeDelay })
    await window.keyboard.press("Enter")

    terminalContent = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    // In a new session, the variable should be empty/unset
    // On Windows CMD, %VAR% is echoed literally if unset, so we check for that
    // On Unix, $VAR becomes empty, so we get MARKER::END
    expect(terminalContent).toContain(shell.markerUnset)
  })

  test("multi-tab operations: create, switch, isolate, close, and empty state", async ({
    electronApp,
    tempTestDir,
  }) => {
    // setup: create a test file and open workspace
    const testFilePath = path.join(tempTestDir, "test.md")
    fs.writeFileSync(testFilePath, "# test file")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)
    await locateSidebarItem(window, "test.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    const terminalPanel = window.getByTestId("terminal-panel")

    // wait for the first tab's shell to be ready
    await expect(window.getByRole("status", { name: "shell profile loaded" })).toBeVisible()

    // --- verify default state: one tab visible ---
    const tabButtons = terminalPanel.getByTestId("terminal-tab")
    await expect(tabButtons).toHaveCount(1)
    await expect(tabButtons.first()).toContainText("spacecake-e2e")

    // one ghostty-terminal mount point should be visible
    const terminalMounts = terminalPanel.getByTestId("ghostty-terminal")
    await expect(terminalMounts.first()).toBeVisible()

    // --- create second tab via Cmd+T ---
    // focus the terminal textarea so the keyboard shortcut is captured
    await terminalMounts.first().locator("textarea").focus()
    await window.waitForTimeout(100)
    await window.keyboard.press("ControlOrMeta+t")
    await window.waitForTimeout(200)

    // verify two tab buttons now exist
    await expect(tabButtons).toHaveCount(2)

    // wait for the new tab's shell to settle
    await window.waitForTimeout(500)

    // --- session isolation: variable set in tab 2 should not exist in tab 1 ---
    // tab 2 is now active. set a variable in it.
    const activeTextarea = terminalPanel.locator(
      '[data-testid="terminal-tab-content"][data-active="true"] [data-testid="ghostty-terminal"] textarea',
    )
    await activeTextarea.focus()
    await window.waitForTimeout(100)
    await window.keyboard.type("export TAB2_VAR=hello", { delay: typeDelay })
    await window.keyboard.press("Enter")
    await window.waitForTimeout(200)

    // switch to tab 1 by clicking the first tab button
    await tabButtons.first().click()
    await window.waitForTimeout(200)

    // in tab 1, echo the variable with a marker to detect if it's set
    const tab1Textarea = terminalPanel.locator(
      '[data-testid="terminal-tab-content"][data-active="true"] [data-testid="ghostty-terminal"] textarea',
    )
    await tab1Textarea.focus()
    await window.waitForTimeout(100)
    await window.keyboard.type(
      isWindows ? "echo MARKER:%TAB2_VAR%:END" : "echo MARKER:$TAB2_VAR:END",
      { delay: typeDelay },
    )
    await window.keyboard.press("Enter")
    await window.waitForTimeout(200)

    // __terminalAPI points to the active tab (tab 1), which should NOT have TAB2_VAR
    let content = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    expect(content).toContain(isWindows ? "MARKER:%TAB2_VAR%:END" : "MARKER::END")

    // --- tab switching via keyboard: Ctrl+Tab cycles forward ---
    await tab1Textarea.focus()
    await window.waitForTimeout(100)
    await window.keyboard.press("Control+Tab")
    await window.waitForTimeout(200)

    // now tab 2 is active; verify the variable is present
    await window.keyboard.type(isWindows ? "echo %TAB2_VAR%" : "echo $TAB2_VAR", {
      delay: typeDelay,
    })
    await window.keyboard.press("Enter")
    await window.waitForTimeout(200)

    content = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    expect(content).toContain("hello")

    // --- Ctrl+Shift+Tab cycles backward (back to tab 1) ---
    const tab2Textarea = terminalPanel.locator(
      '[data-testid="terminal-tab-content"][data-active="true"] [data-testid="ghostty-terminal"] textarea',
    )
    await tab2Textarea.focus()
    await window.waitForTimeout(100)
    await window.keyboard.press("Control+Shift+Tab")
    await window.waitForTimeout(200)

    // verify we're back on tab 1 (first tab button should be active)
    // tab 1 is the active tab now; __terminalAPI should point to it
    content = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).__terminalAPI
      return api?.getAllLines().join("") as string | undefined
    })
    // tab 1 content should still have the marker output from earlier (no "hello")
    expect(content).toContain(isWindows ? "MARKER:%TAB2_VAR%:END" : "MARKER::END")

    // --- close tab via Cmd+W ---
    // switch to tab 2 first so we close it
    await window.keyboard.press("Control+Tab")
    await window.waitForTimeout(200)
    await window.keyboard.press("ControlOrMeta+w")
    await window.waitForTimeout(200)

    // only one tab button should remain
    await expect(tabButtons).toHaveCount(1)

    // --- create tab via "+" button ---
    const addButton = terminalPanel.getByLabel("new terminal tab")
    await addButton.click()
    await window.waitForTimeout(200)

    // two tabs should exist again
    await expect(tabButtons).toHaveCount(2)

    // --- close tab via X button ---
    // hover over the second (new) tab to reveal the close button
    await tabButtons.nth(1).hover()
    await window.waitForTimeout(100)
    const closeButton = tabButtons.nth(1).getByRole("button", { name: /close/ })
    await closeButton.click()
    await window.waitForTimeout(200)

    // only one tab should remain
    await expect(tabButtons).toHaveCount(1)

    // --- closing last tab collapses the panel (same as old delete behavior) ---
    const remainingTextarea = terminalPanel.locator(
      '[data-testid="terminal-tab-content"][data-active="true"] [data-testid="ghostty-terminal"] textarea',
    )
    await remainingTextarea.focus()
    await window.waitForTimeout(100)
    await window.keyboard.press("ControlOrMeta+w")
    await window.waitForTimeout(200)

    // terminal panel should be collapsed (not visible)
    await expect(terminalPanel).not.toBeVisible()

    // re-expand via toggle — should create a fresh terminal automatically
    const terminalToggle = window.getByTestId("statusbar-terminal-toggle")
    await terminalToggle.click()
    await expect(terminalPanel).toBeVisible()

    // verify a new tab exists and is functional
    const freshTabButtons = terminalPanel.getByTestId("terminal-tab")
    await expect(freshTabButtons).toHaveCount(1)
    await expect(freshTabButtons.first()).toContainText("spacecake-e2e")
    await expect(terminalPanel.getByTestId("ghostty-terminal").first()).toBeVisible()
  })
})
