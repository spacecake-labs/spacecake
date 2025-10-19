import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test("clean file, no conflict: external file change updates editor via watcher", async ({
  electronApp,
  tempTestDir,
}) => {
  // copy core.py fixture into the temp workspace
  const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
  const destPath = path.join(tempTestDir, "core.py")
  fs.copyFileSync(fixturePath, destPath)

  const window = await electronApp.firstWindow()

  await stubDialog(electronApp, "showOpenDialog", {
    filePaths: [tempTestDir],
    canceled: false,
  })

  await window.getByRole("button", { name: "open folder" }).click()

  await expect(
    window.getByRole("button", { name: "create file or folder" })
  ).toBeVisible()

  // open the file
  await window.getByRole("button", { name: "core.py" }).first().click()
  await window.getByText("🐍").first().click()

  // ensure second block (class Person / dataclass label present) is visible
  await expect(window.getByText("Person").first()).toBeVisible()

  // overwrite core.py on disk: add a comment at the start of the dataclass block
  const original = fs.readFileSync(destPath, "utf8")
  const insertion = "# updated: hello from watcher\n"
  const updated = original.replace(
    /(@dataclass\nclass Person:[\s\S]*?\n)/,
    (m) => insertion + m
  )
  fs.writeFileSync(destPath, updated, "utf8")

  await expect(window.getByTestId("lexical-editor")).toBeVisible()

  // wait for watcher to reconcile and the new comment to appear in the dataclass block
  const dataclassBlock = window
    .locator('[data-block-id="person-dataclass"]')
    .first()
  await expect(dataclassBlock).toBeVisible()
  // assert the updated text appears somewhere in editors
  await expect(
    window
      .locator(".cm-content")
      .filter({ hasText: "updated: hello from watcher" })
      .first()
  ).toBeVisible()
})

test("dirty file, external change, keep mine: dirty indicator remains and content is unchanged", async ({
  electronApp,
  tempTestDir,
}) => {
  // copy core.py fixture into the temp workspace
  const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
  const destPath = path.join(tempTestDir, "core.py")
  fs.copyFileSync(fixturePath, destPath)

  const window = await electronApp.firstWindow()

  await stubDialog(electronApp, "showOpenDialog", {
    filePaths: [tempTestDir],
    canceled: false,
  })

  await window.getByRole("button", { name: "open folder" }).click()

  await expect(
    window.getByRole("button", { name: "create file or folder" })
  ).toBeVisible()

  // open the file
  await window.getByRole("button", { name: "core.py" }).first().click()

  // click on the person-dataclass block to expand/show it
  const personBlock = window
    .locator('[data-block-id="person-dataclass"]')
    .first()
  await personBlock.click()

  // ensure content is visible
  await expect(window.getByText("Person").first()).toBeVisible()

  // make the file dirty by editing in the person-dataclass block's editor
  const blockEditor = personBlock.locator(".cm-editor").first()
  await expect(blockEditor).toBeVisible()

  // click in the block editor and type something to make it dirty
  await blockEditor.locator(".cm-content").click()
  await window.keyboard.type("# my edit\n", { delay: 50 })

  // verify dirty indicator appears
  const dirtyIndicator = window.getByLabel("unsaved changes")
  await expect(dirtyIndicator).toBeVisible()

  // overwrite core.py on disk: add a different comment
  const original = fs.readFileSync(destPath, "utf8")
  const externalInsertion = "# external change: from filesystem\n"
  const updated = original.replace(
    /(@dataclass\nclass Person:[\s\S]*?\n)/,
    (m) => externalInsertion + m
  )
  fs.writeFileSync(destPath, updated, "utf8")

  // wait for conflict banner to appear
  const conflictBanner = window.getByText("external file change detected")
  await expect(conflictBanner).toBeVisible()

  // click "keep mine" button
  await window.getByRole("button", { name: "keep mine" }).click()

  // verify dirty indicator is still visible (file is still dirty)
  await expect(dirtyIndicator).toBeVisible()

  // verify the editor content still contains our edit (not the external change)
  const editorContent = blockEditor.locator(".cm-content")
  await expect(editorContent).toContainText("# my edit")
})

test("dirty file, external change, keep theirs: file reloads with original content", async ({
  electronApp,
  tempTestDir,
}) => {
  // copy core.py fixture into the temp workspace
  const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
  const destPath = path.join(tempTestDir, "core.py")
  fs.copyFileSync(fixturePath, destPath)

  const window = await electronApp.firstWindow()

  await stubDialog(electronApp, "showOpenDialog", {
    filePaths: [tempTestDir],
    canceled: false,
  })

  await window.getByRole("button", { name: "open folder" }).click()

  await expect(
    window.getByRole("button", { name: "create file or folder" })
  ).toBeVisible()

  // open the file
  await window.getByRole("button", { name: "core.py" }).first().click()

  // click on the person-dataclass block to expand/show it
  const personBlock = window
    .locator('[data-block-id="person-dataclass"]')
    .first()
  await personBlock.click()

  // ensure content is visible
  await expect(window.getByText("Person").first()).toBeVisible()

  // make the file dirty by editing in the person-dataclass block's editor
  const blockEditor = personBlock.locator(".cm-editor").first()
  await expect(blockEditor).toBeVisible()

  // click in the block editor and type something to make it dirty
  await blockEditor.locator(".cm-content").click()
  await window.keyboard.type("# my edit that will be discarded\n", {
    delay: 50,
  })

  // verify dirty indicator appears
  const dirtyIndicator = window.getByLabel("unsaved changes")
  await expect(dirtyIndicator).toBeVisible()

  // verify our edit is in the block editor
  const editorContent = blockEditor.locator(".cm-content")
  await expect(editorContent).toContainText("# my edit that will be discarded")

  // overwrite core.py on disk: add a different comment
  const original = fs.readFileSync(destPath, "utf8")
  const externalInsertion = "# external change: this should appear\n"
  const updated = original.replace(
    /(@dataclass\nclass Person:[\s\S]*?\n)/,
    (m) => externalInsertion + m
  )
  fs.writeFileSync(destPath, updated, "utf8")

  // wait for conflict banner to appear
  const conflictBanner = window.getByText("external file change detected")
  await expect(conflictBanner).toBeVisible()

  // click "keep theirs" button
  await window.getByRole("button", { name: "keep theirs" }).click()

  // wait for file to reload (dirty indicator should be gone and content updated)
  await expect(dirtyIndicator).not.toBeVisible()

  // verify the editor content is now the external change (not our edit)
  await expect(editorContent).toContainText(
    "external change: this should appear"
  )
  await expect(editorContent).not.toContainText(
    "# my edit that will be discarded"
  )
})
