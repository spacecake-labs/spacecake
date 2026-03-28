import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"

test.describe("workspace settings", () => {
  test("settings page opens and closes", async ({ electronApp }) => {
    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // navigate to settings
    await window.getByRole("button", { name: "settings" }).click()

    // verify we're on the settings page
    await expect(window.getByText("configure general workspace settings")).toBeVisible()
    await expect(window.getByRole("heading", { name: "general" })).toBeVisible()
    await expect(window.getByText("enable autosave")).toBeVisible()

    // verify autosave defaults to off
    const autosaveSwitch = window.locator("#autosave-setting")
    await expect(autosaveSwitch).not.toBeChecked()

    // close settings via X button
    await window.getByRole("button", { name: "close settings" }).click()

    // should be back at workspace
    await expect(window.getByText("configure general workspace settings")).not.toBeVisible()
  })
})
