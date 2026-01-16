import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("slash commands e2e", () => {
  test("slash commands in markdown: menu options, code block, heading, and paragraph", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
    fs.copyFileSync(fixturePath, destPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window.getByRole("button", { name: "_README.md" }).first().click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // verify we're in rich view
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    const heading = window.getByRole("heading", {
      name: "An Example README File to Test Parsing",
    })

    // =========================================================================
    // Test 1: Verify slash command menu options are available
    // =========================================================================
    await heading.click({ delay: 100 })
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await expect(window.getByRole("option", { name: "code" })).toBeVisible()
    await expect(window.getByRole("option", { name: "text" })).toBeVisible()
    await expect(
      window.getByRole("option", { name: "heading 1" })
    ).toBeVisible()

    // dismiss menu
    await window.keyboard.press("Escape", { delay: 100 })
    // delete the slash character
    await window.keyboard.press("Backspace", { delay: 100 })

    // =========================================================================
    // Test 2: Insert code block with slash command
    // =========================================================================
    await heading.click({ delay: 100 })
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await expect(window.getByRole("option", { name: "code" })).toBeVisible()
    await window.keyboard.press("Enter", { delay: 100 })

    const newCodeBlock = editor
      .locator('[data-block-id="anonymous-code"]')
      .first()
    await expect(newCodeBlock).toBeVisible()
    await window.keyboard.type("print('second code block')", { delay: 100 })
    await expect(
      newCodeBlock.getByText("print('second code block')")
    ).toBeVisible()

    // =========================================================================
    // Test 3: Insert h1 heading with slash command
    // =========================================================================
    await window.keyboard.press("ControlOrMeta+ArrowDown", { delay: 300 })
    await window.keyboard.press("ArrowDown", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await window
      .getByRole("option", { name: "heading 1 #" })
      .click({ delay: 100 })
    await window.keyboard.type("TEST_HEADING", { delay: 100 })

    await expect(
      window.getByRole("heading", { name: "TEST_HEADING" })
    ).toBeVisible()

    // =========================================================================
    // Test 4: Insert paragraph with slash command
    // =========================================================================
    await window.keyboard.press("End", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await window.getByRole("option", { name: "text" }).click({ delay: 100 })
    await window.keyboard.type("TEST_PARA", { delay: 100 })

    await expect(
      window.getByRole("paragraph").filter({ hasText: "TEST_PARA" })
    ).toBeVisible()
  })

  test("slash commands in Python files", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the core.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
    const destPath = path.join(tempTestDir, "core.py")
    fs.copyFileSync(fixturePath, destPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // verify we're in rich view
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    const moduleBlock = editor.locator('[data-block-id*="core.py-module"]')
    const codeSection = moduleBlock.locator('[data-section="code"]')

    await codeSection.getByLabel("folded code").click()
    const moduleDoc = codeSection.getByText("A file to test block parsing.")

    await moduleDoc.click({ delay: 100 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("ArrowDown", { delay: 100 })

    await window.keyboard.press("/", { delay: 200 })

    await window.getByRole("option", { name: "code" }).click({ delay: 100 })

    const codeBlock = editor.locator('[data-block-id="anonymous-code"]')
    await expect(codeBlock).toBeVisible()

    // TODO: get this working without needing a space before 'def'
    await window.keyboard.type(" def test_function():\n    return True", {
      delay: 100,
    })
    await expect(
      codeBlock.getByText("def test_function():\n    return True")
    ).toBeVisible()
  })
})
