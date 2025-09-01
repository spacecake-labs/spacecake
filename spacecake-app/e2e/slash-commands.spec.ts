import fs from "fs"
import path from "path"

import { stubDialog } from "electron-playwright-helpers"

import { expect, test } from "./fixtures"

test.describe("slash commands e2e", () => {
  test("slash command options are available", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
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
    await window.getByRole("button", { name: "_README.md" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify we're in blocks view
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    const heading = window.getByRole("heading", {
      name: "An Example README File to Test Parsing",
    })

    await heading.click({ delay: 100 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("End", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    // expect the slash command menu to appear with at least one option
    await expect(window.getByRole("option", { name: "code" })).toBeVisible()
    await expect(window.getByRole("option", { name: "text" })).toBeVisible()
    await expect(
      window.getByRole("option", { name: "heading 1" })
    ).toBeVisible()
  })

  test("can insert code block with slash command", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
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
    await window.getByRole("button", { name: "_README.md" }).first().click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // verify we're in blocks view
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    const heading = window.getByRole("heading", {
      name: "An Example README File to Test Parsing",
    })

    await heading.click({ delay: 100 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    // expect the slash command menu to appear
    await expect(window.getByRole("option", { name: "code" })).toBeVisible()
    // select code block option using enter key
    await window.keyboard.press("Enter", { delay: 100 })

    // expect a new code block node to appear
    await expect(
      editor.locator('[data-block-id="anonymous-code"]')
    ).toBeVisible()
    // type some code without doing anything else
    await window.keyboard.type("print('hello world')", { delay: 100 })

    // expect the code to be in the code block
    await expect(window.getByText("print('hello world')")).toBeVisible()
  })

  test("can insert h1 heading with slash command", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
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
    await window.getByRole("button", { name: "_README.md" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify we're in blocks view
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    const heading = window.getByRole("heading", {
      name: "An Example README File to Test Parsing",
    })

    await heading.click({ delay: 100 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await window
      .getByRole("option", { name: "heading 1 #" })
      .click({ delay: 100 })

    await window.keyboard.type("TEST_HEADING", { delay: 100 })

    await expect(
      window.getByRole("heading", { name: "TEST_HEADING" })
    ).toBeVisible()
  })

  test("can insert paragraph with slash command", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the _README.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/_README.md")
    const destPath = path.join(tempTestDir, "_README.md")
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
    await window.getByRole("button", { name: "_README.md" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify we're in blocks view
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    await window.getByText("A brief description").click({ delay: 200 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
    await window.keyboard.press("/", { delay: 200 })

    await window.getByRole("option", { name: "text" }).click({ delay: 100 })
    await window.keyboard.type("TEST_PARA", { delay: 100 })

    await expect(
      window.getByRole("paragraph").filter({ hasText: "TEST_PARA" })
    ).toBeVisible()
  })

  test("can use slash commands in Python files", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy the core.py fixture into the temp workspace
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

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click()

    const editor = window.getByTestId("lexical-editor")
    await expect(editor).toBeVisible()

    // verify we're in blocks view
    await expect(window.getByRole("button", { name: "blocks" })).toBeVisible()

    const heading = window.getByRole("heading", {
      name: "A file to test block parsing.",
    })

    await heading.click({ delay: 100 })

    // navigate to a new paragraph and type slash
    await window.keyboard.press("ControlOrMeta+ArrowRight", { delay: 100 })
    await window.keyboard.press("Enter", { delay: 100 })
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
