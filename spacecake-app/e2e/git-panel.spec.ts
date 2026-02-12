import { execSync } from "child_process"
import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@test.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@test.com",
}

test.describe("git panel", () => {
  test("working tree, commits, toggle visibility, and dock switching", async ({
    electronApp,
    tempTestDir,
  }) => {
    // setup: init repo with a commit, then create working tree changes
    execSync("git init", { cwd: tempTestDir, env: gitEnv })
    const committedFile = path.join(tempTestDir, "committed.md")
    fs.writeFileSync(committedFile, "# committed")
    execSync("git add .", { cwd: tempTestDir, env: gitEnv })
    execSync('git commit -m "initial commit"', { cwd: tempTestDir, env: gitEnv })
    fs.writeFileSync(path.join(tempTestDir, "untracked.md"), "# untracked")
    fs.writeFileSync(committedFile, "# committed\nmodified line")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // open a file to get to the workspace route
    await locateSidebarItem(window, "committed.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // --- toggle visibility ---

    // show git panel
    const showToggle = window.getByRole("button", { name: "show git panel" })
    await expect(showToggle).toBeVisible()
    await showToggle.click()
    await expect(window.getByText("commits")).toBeVisible()

    // hide git panel
    const hideToggle = window.getByRole("button", { name: "hide git panel" })
    await hideToggle.click()
    await expect(window.getByText("commits")).not.toBeVisible()

    // show again
    await window.getByRole("button", { name: "show git panel" }).click()
    await expect(window.getByText("commits")).toBeVisible()

    // --- working tree content ---

    await expect(window.getByText("working tree")).toBeVisible()
    await expect(window.getByText("committed.md").first()).toBeVisible()
    await expect(window.getByTitle("modified").first()).toBeVisible()
    await expect(window.getByText("untracked.md").first()).toBeVisible()
    await expect(window.getByTitle("untracked").first()).toBeVisible()

    // --- commit selection ---

    await expect(window.getByText("initial commit")).toBeVisible()
    await window.getByText("initial commit").click()
    await expect(window.getByText("committed.md").first()).toBeVisible()

    // --- dock switching ---

    // default is left
    await expect(window.locator("#git-panel-left")).toBeVisible()

    // switch to right
    await window.getByRole("button", { name: "change git dock position" }).click()
    await window.getByText("dock right").click()
    await expect(window.locator("#git-panel-right")).toBeVisible()

    // switch to bottom
    await window.getByRole("button", { name: "change git dock position" }).click()
    await window.getByText("dock bottom").click()
    await expect(window.locator("#git-panel-bottom")).toBeVisible()

    // switch back to left
    await window.getByRole("button", { name: "change git dock position" }).click()
    await window.getByText("dock left").click()
    await expect(window.locator("#git-panel-left")).toBeVisible()
  })

  test("non-git directory hides git toggle in status bar", async ({ electronApp, tempTestDir }) => {
    fs.writeFileSync(path.join(tempTestDir, "plain.md"), "# plain file")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    await locateSidebarItem(window, "plain.md").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // git toggle should not be visible (gitBranch atom is null for non-git repos)
    await expect(window.getByRole("button", { name: "show git panel" })).not.toBeVisible()
  })
})
