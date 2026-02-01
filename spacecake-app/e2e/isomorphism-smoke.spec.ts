import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

/**
 * Smoke tests for file isomorphism through the full Electron pipeline.
 *
 * These tests verify the complete roundtrip: file read → IPC → editor → save → file write.
 * Comprehensive isomorphism testing of different document structures is done in faster
 * headless tests (see src/components/editor/*-isomorphism.test.tsx and
 * src/lib/parser/python/isomorphism.test.ts).
 */
test.describe("isomorphism smoke tests", () => {
  test("markdown file maintains isomorphism through full pipeline", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, destPath)

    const originalContent = fs.readFileSync(fixturePath, "utf-8")

    await waitForWorkspace(window)

    // open the file
    await locateSidebarItem(window, "_README.md").click()

    // verify we're in rich view and editor loaded
    await expect(window.getByRole("link", { name: "switch to source view" })).toBeVisible()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // basic sanity check that content rendered
    await expect(
      window.getByRole("heading", {
        name: "An Example README File to Test Parsing",
      }),
    ).toBeVisible()

    // save the file
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    await window.waitForTimeout(1000)

    // verify isomorphism
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(originalContent)
  })

  test("python file maintains isomorphism through full pipeline", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy md.py fixture (tests python with markdown directives)
    const fixturePath = path.join(process.cwd(), "tests/fixtures/md.py")
    const destPath = path.join(tempTestDir, "md.py")
    fs.copyFileSync(fixturePath, destPath)

    const originalContent = fs.readFileSync(fixturePath, "utf-8")

    await waitForWorkspace(window)

    // open the file
    await locateSidebarItem(window, "md.py").click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // basic sanity check that content rendered
    await expect(
      window.getByRole("heading", {
        name: "A file with markdown directives.",
      }),
    ).toBeVisible()

    // save the file
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    await window.waitForTimeout(1000)

    // verify isomorphism
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(originalContent)
  })
})
