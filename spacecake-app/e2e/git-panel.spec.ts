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

    // --- git panel refreshes when file is saved in editor ---

    // give workspace watcher time to fully initialize after dock switching
    // (on Windows, the IPC listener may not be attached when events fire)
    await window.waitForTimeout(500)

    // create a new file externally (file watcher adds to sidebar)
    const newFile = path.join(tempTestDir, "created-during-test.md")
    fs.writeFileSync(newFile, "# initial content")

    // wait for sidebar to show the new file
    await expect(locateSidebarItem(window, "created-during-test.md")).toBeVisible()

    // select working tree to see current changes
    await window.getByText("working tree").click()

    // verify the new file appears as untracked in git panel
    const gitPanel = window.locator("#git-panel-left")
    await expect(gitPanel.getByRole("button", { name: "created-during-test.md" })).toBeVisible()
    await expect(gitPanel.getByTitle("untracked").first()).toBeVisible()

    // open the file in editor
    await locateSidebarItem(window, "created-during-test.md").click({ force: true })
    await expect(window.getByText("initial content")).toBeVisible()

    await window.getByText("initial content").click({ force: true })
    await window.keyboard.press("End")
    await window.keyboard.type(" EDITED", { delay: 50 })
    await expect(window.getByText("EDITED")).toBeVisible()

    // save with Cmd+S
    await window.keyboard.press("ControlOrMeta+s")

    // wait for save to complete
    await window.waitForTimeout(500)

    // verify file on disk was saved
    const savedContent = fs.readFileSync(newFile, "utf-8")
    expect(savedContent).toContain("EDITED")

    // verify git panel still shows the file (refresh didn't break anything)
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
