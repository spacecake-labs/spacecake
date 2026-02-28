import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"

test.describe("workspace settings", () => {
  test("settings navigation and autosave toggle persistence", async ({ electronApp }) => {
    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // --- Part 1: Test settings page navigation ---

    // Navigate to settings
    await window.getByRole("button", { name: "settings" }).click()

    // Verify we're on the settings page
    await expect(window.getByText("configure general workspace settings")).toBeVisible()

    // Close settings via X button
    await window.getByRole("button", { name: "close settings" }).click()

    // Should be back at workspace (settings-specific content should not be visible)
    await expect(window.getByText("configure general workspace settings")).not.toBeVisible()

    // --- Part 2: Test autosave toggle persists when enabled ---

    // Navigate to settings
    await window.getByRole("button", { name: "settings" }).click()

    // Verify settings page loaded
    await expect(window.getByRole("heading", { name: "general" })).toBeVisible()
    await expect(window.getByText("enable autosave")).toBeVisible()

    // Get the autosave switch
    const autosaveSwitch = window.locator("#autosave-setting")

    // Verify autosave is off by default
    await expect(autosaveSwitch).not.toBeChecked()

    // Enable autosave
    await autosaveSwitch.click()
    await expect(autosaveSwitch).toBeChecked()

    // wait for the setting to persist to database (pglite worker adds latency)
    await window.waitForTimeout(1500)

    // Reload the page (simulates app restart without full electron restart)
    await window.reload()

    // Wait for workspace to load again
    await waitForWorkspace(window)

    // wait for any file restore to complete before navigating
    // (the active editor is restored asynchronously via the pane machine)
    await window.waitForTimeout(2000)

    // Navigate back to settings
    await window.getByRole("button", { name: "settings" }).click()
    // wait for settings page to fully render
    await expect(window.getByRole("heading", { name: "general" })).toBeVisible()

    // Verify autosave is still on
    const autosaveSwitchAfterReload = window.locator("#autosave-setting")
    await expect(autosaveSwitchAfterReload).toBeChecked()

    // --- Part 3: Test autosave toggle can be turned off and persists ---

    // Disable autosave (wait for switch to be interactive after page render)
    await expect(autosaveSwitchAfterReload).toBeVisible()
    await expect(autosaveSwitchAfterReload).toBeChecked()
    await autosaveSwitchAfterReload.click()
    await expect(autosaveSwitchAfterReload).not.toBeChecked()

    // wait for the setting to persist to database (pglite worker adds latency)
    await window.waitForTimeout(1500)

    // Reload and verify
    await window.reload()
    await waitForWorkspace(window)
    await window.getByRole("button", { name: "settings" }).click()
    // wait for settings page to fully render
    await expect(window.getByRole("heading", { name: "general" })).toBeVisible()

    const autosaveSwitchFinal = window.locator("#autosave-setting")
    await expect(autosaveSwitchFinal).not.toBeChecked()
  })
})
