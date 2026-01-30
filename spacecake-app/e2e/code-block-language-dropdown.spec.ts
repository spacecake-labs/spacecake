import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

import { LANGUAGE_SUPPORT } from "@/types/language"

test.describe("code block language dropdown e2e", () => {
  test("language dropdown: change language, verify all options, and disabled for Python files", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy fixtures into the temp workspace
    const plaintextFixturePath = path.join(
      process.cwd(),
      "tests/fixtures/plaintext-code-block.md"
    )
    const plaintextDestPath = path.join(tempTestDir, "plaintext-code-block.md")
    fs.copyFileSync(plaintextFixturePath, plaintextDestPath)

    const pythonFixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
    const pythonDestPath = path.join(tempTestDir, "core.py")
    fs.copyFileSync(pythonFixturePath, pythonDestPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // =========================================================================
    // Test 1: Dropdown shows all available languages
    // =========================================================================
    await locateSidebarItem(window, "plaintext-code-block.md").click()

    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    const codeBlock = window.locator(".cm-editor")
    await expect(
      codeBlock.getByText('console.log("This is plaintext")').first()
    ).toBeVisible()

    const languageSelect = window
      .getByRole("combobox")
      .filter({ hasText: "plaintext" })
    await expect(languageSelect).toBeVisible()
    await expect(languageSelect).toBeEnabled()

    // open dropdown and verify all languages are available
    await languageSelect.click()

    for (const languageSpec of Object.values(LANGUAGE_SUPPORT) as Array<
      (typeof LANGUAGE_SUPPORT)[keyof typeof LANGUAGE_SUPPORT]
    >) {
      const optionName = languageSpec.name.toLowerCase()
      await expect(
        window.getByRole("option", { name: optionName, exact: true }),
        `language option "${optionName}" should be visible in dropdown`
      ).toBeVisible()
    }

    // =========================================================================
    // Test 2: Change language from plaintext to python
    // =========================================================================
    await window.getByRole("option", { name: "python" }).click()

    const updatedLanguageSelect = window
      .getByRole("combobox")
      .filter({ hasText: "python" })
    await expect(updatedLanguageSelect).toBeVisible()
    await expect(updatedLanguageSelect).toHaveText(/python/i)

    // =========================================================================
    // Test 3: Python file code block dropdown is disabled
    // =========================================================================
    await locateSidebarItem(window, "core.py").click()

    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    const pythonLanguageSelect = window
      .locator('button[role="combobox"]')
      .first()
    await expect(pythonLanguageSelect).toBeVisible()
    await expect(pythonLanguageSelect).toBeDisabled()
  })
})
