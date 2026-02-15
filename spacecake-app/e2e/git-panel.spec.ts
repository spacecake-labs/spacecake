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

    const gitPanel = window.locator("#git-panel-left")
    await expect(gitPanel.getByText("working tree")).toBeVisible()
    await expect(gitPanel.getByRole("button", { name: /committed\.md/ })).toBeVisible()
    await expect(gitPanel.getByTitle("modified").first()).toBeVisible()
    await expect(gitPanel.getByRole("button", { name: /untracked\.md/ })).toBeVisible()
    await expect(gitPanel.getByTitle("untracked").first()).toBeVisible()

    // --- commit selection ---

    await expect(gitPanel.getByText("initial commit")).toBeVisible()
    await gitPanel.getByText("initial commit").click()
    await expect(gitPanel.getByRole("button", { name: /committed\.md/ })).toBeVisible()

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

    // --- git panel refreshes when file is saved in editor ---

    // create a new file externally (file watcher adds to sidebar)
    const newFile = path.join(tempTestDir, "created-during-test.md")
    fs.writeFileSync(newFile, "# initial content")

    // select working tree to see current changes
    await gitPanel.getByText("working tree").click()

    // verify the new file appears as untracked in git panel
    await expect(gitPanel.getByRole("button", { name: "created-during-test.md" })).toBeVisible()
    await expect(gitPanel.getByTitle("untracked").first()).toBeVisible()

    // modify the file externally and verify git panel refreshes
    fs.writeFileSync(newFile, "# initial content EDITED")
    await expect(gitPanel.getByRole("button", { name: "created-during-test.md" })).toBeVisible()
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
