import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { LANGUAGE_SUPPORT } from "@/types/language"

import { expect, test } from "./fixtures"

test.describe("code block language dropdown e2e", () => {
  test("change plaintext code block language to python via dropdown", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy plaintext code block fixture into the temp workspace
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/plaintext-code-block.md"
    )
    const destPath = path.join(tempTestDir, "plaintext-code-block.md")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "plaintext-code-block.md" })
      .click()

    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // find the code block with the plaintext content
    const codeBlock = window.locator(".cm-editor")
    await expect(
      codeBlock.getByText('console.log("This is plaintext")').first()
    ).toBeVisible()

    // verify the language dropdown exists and is enabled
    const languageSelect = window
      .getByRole("combobox")
      .filter({ hasText: "plaintext" })
    await expect(languageSelect).toBeVisible()
    await expect(languageSelect).toBeEnabled()

    // click the dropdown
    await languageSelect.click()

    // select python from the dropdown
    await window.getByRole("option", { name: "python" }).click()

    // verify the language has been updated in the UI by checking the dropdown shows python
    const updatedLanguageSelect = window
      .getByRole("combobox")
      .filter({ hasText: "python" })
    await expect(updatedLanguageSelect).toBeVisible()
    await expect(updatedLanguageSelect).toHaveText(/python/i)
  })

  test("python file code block dropdown is visible but disabled", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy a python fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
    const destPath = path.join(tempTestDir, "core.py")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the python file
    await window.getByRole("button", { name: "core.py" }).click()

    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // find the language dropdown - should be visible
    const languageSelect = window.locator('button[role="combobox"]').first()
    await expect(languageSelect).toBeVisible()

    // verify it's disabled
    await expect(languageSelect).toBeDisabled()

    // verify we cannot click it
    const isDisabled = await languageSelect.isDisabled()
    expect(isDisabled).toBe(true)
  })

  test("dropdown shows all available languages", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy a markdown fixture into the temp workspace
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/plaintext-code-block.md"
    )
    const destPath = path.join(tempTestDir, "plaintext-code-block.md")
    fs.copyFileSync(fixturePath, destPath)

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    })

    await window.getByRole("button", { name: "open folder" }).click()

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible()

    // open the file
    await window
      .getByRole("button", { name: "plaintext-code-block.md" })
      .click()

    // verify we're in rich view
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // open the dropdown
    const languageSelect = window
      .getByRole("combobox")
      .filter({ hasText: "plaintext" })
    await languageSelect.click()

    // verify all configured languages appear in the dropdown
    for (const languageSpec of Object.values(LANGUAGE_SUPPORT) as Array<
      (typeof LANGUAGE_SUPPORT)[keyof typeof LANGUAGE_SUPPORT]
    >) {
      const optionName = languageSpec.name.toLowerCase()
      await expect(
        window.getByRole("option", { name: optionName }),
        `language option "${optionName}" should be visible in dropdown`
      ).toBeVisible()
    }
  })
})
