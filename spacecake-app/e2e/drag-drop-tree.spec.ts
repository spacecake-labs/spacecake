import fs from "fs"
import path from "path"

import type { Page } from "@playwright/test"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

/** normalize path to forward slashes (matches how the UI stores data-tree-path) */
const normalizePath = (p: string) => p.replace(/\\/g, "/")

/**
 * dispatches HTML5 drag events to simulate a drag-and-drop operation.
 * playwright's `dragTo` uses mouse events which don't reliably trigger
 * pragmatic-drag-and-drop's DragEvent listeners, so we dispatch
 * native DragEvent instances directly.
 */
async function dragTreeItem(page: Page, sourcePath: string, targetPath: string) {
  await page.evaluate(
    ({ sourcePath, targetPath }) => {
      const source = document.querySelector(`[data-tree-path="${sourcePath}"]`)
      const target = document.querySelector(`[data-tree-path="${targetPath}"]`)
      if (!source || !target) {
        throw new Error(`could not find source (${sourcePath}) or target (${targetPath})`)
      }

      const dataTransfer = new DataTransfer()

      source.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }),
      )

      // fire dragover on the target center to trigger "make-child" instruction
      const targetRect = target.getBoundingClientRect()
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: targetRect.left + targetRect.width / 2,
          clientY: targetRect.top + targetRect.height / 2,
        }),
      )

      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }))

      source.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }),
      )
    },
    { sourcePath, targetPath },
  )
}

test.describe("drag and drop in file tree", () => {
  test("drag a file into a folder", async ({ electronApp, tempTestDir }) => {
    // setup: create a folder and a file at the root level
    const folder = path.join(tempTestDir, "target-folder")
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(tempTestDir, "dragged-file.txt"), "content")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    // wait for both items to appear in the sidebar
    await expect(locateSidebarItem(window, "target-folder")).toBeVisible()
    await expect(locateSidebarItem(window, "dragged-file.txt")).toBeVisible()

    // drag the file onto the folder using HTML5 DragEvent
    await dragTreeItem(
      window,
      normalizePath(path.join(tempTestDir, "dragged-file.txt")),
      normalizePath(path.join(tempTestDir, "target-folder")),
    )

    // verify the file moved into the folder on disk
    await expect(async () => {
      expect(fs.existsSync(path.join(folder, "dragged-file.txt"))).toBe(true)
      expect(fs.existsSync(path.join(tempTestDir, "dragged-file.txt"))).toBe(false)
    }).toPass({ timeout: 5000 })
  })

  test("drag a folder into another folder", async ({ electronApp, tempTestDir }) => {
    // setup: create two folders, one with a child file
    const folderA = path.join(tempTestDir, "folder-a")
    const folderB = path.join(tempTestDir, "folder-b")
    fs.mkdirSync(folderA, { recursive: true })
    fs.mkdirSync(folderB, { recursive: true })
    fs.writeFileSync(path.join(folderA, "child.txt"), "child content")

    const window = await electronApp.firstWindow()
    await waitForWorkspace(window)

    await expect(locateSidebarItem(window, "folder-a")).toBeVisible()
    await expect(locateSidebarItem(window, "folder-b")).toBeVisible()

    // drag folder-a onto folder-b
    await dragTreeItem(
      window,
      normalizePath(path.join(tempTestDir, "folder-a")),
      normalizePath(path.join(tempTestDir, "folder-b")),
    )

    // verify the folder moved with its children
    await expect(async () => {
      expect(fs.existsSync(path.join(folderB, "folder-a", "child.txt"))).toBe(true)
      expect(fs.existsSync(folderA)).toBe(false)
    }).toPass({ timeout: 5000 })
  })
})
