import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("python e2e", () => {
  test("open workspace and create an empty python file", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    const window = await electronApp.firstWindow()

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // create a python file
    await window.getByRole("button", { name: "create file or folder" }).click()
    await window.getByRole("menuitem", { name: "new file" }).click()

    const textbox = window.getByRole("textbox", { name: "filename.txt" })
    await textbox.fill("empty.py")
    await textbox.press("Enter", { delay: 100 })

    await expect(
      window.getByRole("button", { name: "empty.py" }).first()
    ).toBeVisible()

    // Wait for the create file input to disappear (indicating state reset)
    await expect(textbox).not.toBeVisible()

    // open the newly created file
    await window.getByRole("button", { name: "empty.py" }).first().click()

    // Explicitly wait for the Lexical editor to be visible for the empty file
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // focus the code block toolbar and verify default code block type appears
    await window.getByText("🐍").first().click()
    await expect(window.getByText("file").first()).toBeVisible()

    const expectedFilePath = path.join(tempTestDir, "empty.py")
    expect(fs.existsSync(expectedFilePath)).toBe(true)

    testInfo.annotations.push({
      type: "info",
      description: `created python file: ${expectedFilePath}`,
    })
  })

  test("open workspace and render core.py rich", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy core.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py")
    const destPath = path.join(tempTestDir, "core.py")
    fs.copyFileSync(fixturePath, destPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click()

    // verify module dosctring is parsed as markdown header
    await expect(
      window.getByRole("heading", {
        name: "A file to test block parsing.",
      })
    ).toBeVisible()

    // verify rich are present via toolbar and labels
    await window.getByText("🐍").first().click()
    await expect(window.getByText("import").first()).toBeVisible()
    await expect(window.getByText("Person").first()).toBeVisible()
    await expect(window.getByText("dataclass").first()).toBeVisible()
    await expect(window.getByText("fibonacci").first()).toBeVisible()
    await expect(window.getByText("function").first()).toBeVisible()
    await expect(window.getByText("Calculator").first()).toBeVisible()
    await expect(
      window.getByText("class", { exact: true }).first()
    ).toBeVisible()
    await expect(window.getByText("misc").first()).toBeVisible()

    // verify key lines render
    await expect(window.getByText("class Calculator:").first()).toBeVisible()
    await expect(window.getByText("def add(self, a, b):").first()).toBeVisible()
    await expect(window.getByText("return a + b").first()).toBeVisible()

    // check the first block's first gutter line number equals 3
    // scope to import block via data-block-id from blockId()
    const importBlock = window
      .locator('[data-block-id="anonymous-import"]')
      .first()
    await expect(importBlock).toBeVisible()
    const firstEditor = importBlock.locator(".cm-editor").first()
    await expect(firstEditor).toBeVisible()
    // focus editor and move caret to the first line to ensure gutter aligns to start
    const content = firstEditor.locator(".cm-content")
    await content.focus()
    await content.press("ControlOrMeta+ArrowUp", { delay: 100 })
    const activeGutter = firstEditor
      .locator(
        ".cm-gutter.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter"
      )
      .first()
    await expect(activeGutter).toHaveText("3")

    // verify double-click highlights the selected word and other occurrences
    // scope to the import block editor content
    const contentTextLocators = firstEditor
      .locator(".cm-content")
      .getByText("datetime")
    await expect(contentTextLocators).toHaveCount(2)
    // double-click the second occurrence to select the word
    await contentTextLocators.last().dblclick()
    // allow the view to update selection decorations
    const selectionBackgrounds = firstEditor.locator(
      ".cm-selectionLayer .cm-selectionBackground"
    )
    const selectionMatches = firstEditor.locator(".cm-selectionMatch")
    await expect(selectionBackgrounds).toHaveCount(1)
    await expect(selectionMatches).toHaveCount(1)

    // navigation tests: dynamic paragraph creation/removal between code rich
    const editors = window.locator(".cm-editor")
    const thirdEditorRoot = editors.nth(2)
    const thirdContent = thirdEditorRoot.locator(".cm-content")

    // Move caret to end of first code block and ArrowDown into spacer (creates paragraph)
    // click a stable token within the first editor to ensure caret placement
    await firstEditor.locator(".cm-content").getByText("import").first().click()
    await window.keyboard.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await window.keyboard.press("ArrowDown", { delay: 100 })
    // create spacer and click it, then navigate out to next code block
    const newPara = window
      .locator(".ContentEditable__root")
      .getByRole("paragraph")
      .first()
    await expect(newPara).toBeVisible()
    await window.keyboard.press("ArrowDown", { delay: 100 })

    // recreate a spacer and then type to verify text stays
    await thirdEditorRoot
      .locator(".cm-content")
      .getByText("Person")
      .first()
      .click()
    // Click on "Person" puts us in the Person dataclass block
    // From here, Cmd+Up should go to start of block, then ArrowUp creates spacer above
    await thirdContent.press("ControlOrMeta+ArrowUp", { delay: 100 })
    await thirdContent.press("ArrowUp", { delay: 100 }) // create spacer above

    const spacerText1 = "PARA-TEXT-ONE"
    await window
      .getByTestId("lexical-editor")
      .pressSequentially(spacerText1, { delay: 100 })
    await expect(window.getByText(spacerText1).first()).toBeVisible()

    // From spacer, ArrowDown should jump into next code block (fibonacci function)
    await window.keyboard.press("ArrowDown", { delay: 100 })

    // Move caret to start of fibonacci function block and ArrowUp to reach spacer
    const fibonacciBlock = window.locator(
      '[data-block-id="fibonacci-function"]'
    )
    await fibonacciBlock.locator(".cm-content").click()
    await expect(fibonacciBlock.locator(".cm-editor").first()).toHaveClass(
      /focused/
    )
    await window.keyboard.press("ControlOrMeta+ArrowUp", { delay: 100 })
    await fibonacciBlock.press("ArrowUp", { delay: 100 }) // to spacer above

    const spacerText2 = "PARA-TEXT-TWO"
    await window.keyboard.type(spacerText2, { delay: 100 })
    await expect(window.getByText(spacerText2).first()).toBeVisible()
    await window.keyboard.press("ArrowDown", { delay: 100 }) // into next code block

    // Verify ArrowLeft behaves like ArrowUp at the start edge
    await thirdEditorRoot
      .locator(".cm-content")
      .getByText("Person")
      .first()
      .click()

    await thirdContent.press("ControlOrMeta+ArrowUp", { delay: 100 })
    await thirdContent.press("ArrowLeft", { delay: 100 }) // to spacer above
    // type into spacer above and verify it appears
    const spacerText3 = "PARA-TEXT-THREE"
    await window
      .getByTestId("lexical-editor")
      .pressSequentially(spacerText3, { delay: 100 })
    await expect(window.getByText(spacerText3).first()).toBeVisible()
    await window.keyboard.press("ArrowLeft", { delay: 100 }) // to previous code block

    // Test that non-empty spacer persists when navigating away
    await thirdEditorRoot
      .locator(".cm-content")
      .getByText("Person")
      .first()
      .click()

    await thirdContent.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await thirdContent.press("ArrowDown", { delay: 100 }) // create spacer below second block
    const keepText = "KEEP-PARA"
    await window
      .getByTestId("lexical-editor")
      .pressSequentially(keepText, { delay: 100 })
    await expect(window.getByText(keepText).first()).toBeVisible()
    await window.keyboard.press("ArrowDown", { delay: 100 }) // into next code block (fibonacci function)
    // ensure text persists
    await expect(window.getByText(keepText).first()).toBeVisible()

    // test deleting the import code block
    const importBlockToDelete = window.locator(
      '[data-block-id="anonymous-import"]'
    )
    await expect(importBlockToDelete).toBeVisible()

    // click the delete button within this specific block
    await importBlockToDelete.getByTestId("block-delete-button").click()

    // verify the import block is gone
    await expect(importBlockToDelete).not.toBeVisible()
  })

  test("switching between core.py and empty.py updates editor", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy both fixtures into the temp workspace
    const coreFixture = path.join(process.cwd(), "tests/fixtures/core.py")
    const emptyFixture = path.join(process.cwd(), "tests/fixtures/empty.py")
    const coreDest = path.join(tempTestDir, "core.py")
    const emptyDest = path.join(tempTestDir, "empty.py")
    fs.copyFileSync(coreFixture, coreDest)
    fs.copyFileSync(emptyFixture, emptyDest)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open core.py and verify python rich are visible
    await window.getByRole("button", { name: "core.py" }).first().click()
    await window.getByText("🐍").first().click()
    await expect(window.getByText("import").first()).toBeVisible()

    // switch to empty.py and verify default toolbar state
    await window.getByRole("button", { name: "empty.py" }).first().click()
    // wait until header reflects the newly selected file path (contains 'empty.py')
    await expect
      .poll(async () =>
        window.evaluate(
          () => document.querySelector("header")?.textContent || ""
        )
      )
      .toContain("empty.py")
    // verify the editor shows content from empty.py
    await expect(window.getByText("An empty file.").first()).toBeVisible()
  })

  test("switching between files in different folders updates editor", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create nested folder and copy fixtures
    const nestedFolder = path.join(tempTestDir, "nested")
    fs.mkdirSync(nestedFolder, { recursive: true })
    const coreFixture = path.join(process.cwd(), "tests/fixtures/core.py")
    const emptyFixture = path.join(process.cwd(), "tests/fixtures/empty.py")
    const coreDest = path.join(tempTestDir, "core.py")
    const emptyDest = path.join(nestedFolder, "empty.py")
    fs.copyFileSync(coreFixture, coreDest)
    fs.copyFileSync(emptyFixture, emptyDest)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open core.py and verify python content
    await window.getByRole("button", { name: "core.py" }).first().click()
    await window.getByText("🐍").first().click()
    await expect(window.getByText("import").first()).toBeVisible()

    // expand nested folder and open empty.py
    await window.getByRole("button", { name: "nested" }).first().click()
    await window.getByRole("button", { name: "empty.py" }).first().click()

    // wait for selection to reflect switch
    await expect
      .poll(async () =>
        window.evaluate(
          () => document.querySelector("header")?.textContent || ""
        )
      )
      .toContain("empty.py")

    // verify editor shows content from empty.py
    await expect(window.getByText("An empty file.").first()).toBeVisible()
  })

  test("saving new misc block persists after rerender without navigation", async ({
    electronApp,
    tempTestDir,
  }) => {
    test.slow()
    const window = await electronApp.firstWindow()

    // prepare core.py in temp workspace
    const coreFixture = path.join(process.cwd(), "tests/fixtures/core.py")
    const coreDest = path.join(tempTestDir, "core.py")
    fs.copyFileSync(coreFixture, coreDest)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open core.py
    await window.getByRole("button", { name: "core.py" }).first().click()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    await window.getByText("🐍").first().click()

    // focus import block editor content and add a misc line after two Enters
    const importBlock = window
      .locator('[data-block-id="anonymous-import"]')
      .first()
    await expect(importBlock).toBeVisible()
    const importEditor = importBlock.locator(".cm-editor").first()
    await expect(importEditor).toBeVisible()
    // keep a locator reference if needed for future checks
    const importContent = importEditor.locator(".cm-content")
    await importContent.focus()
    await importContent.press("ControlOrMeta+ArrowDown", { delay: 100 })
    await importContent.press("Enter", { delay: 100 })
    await importContent.press("Enter", { delay: 100 })
    await importContent.pressSequentially("x = 5", { delay: 100 })

    await window.waitForTimeout(1000)

    // save from header and wait for rerender: observe button text transition
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()
    await window.locator(".cm-editor").first().waitFor({ state: "visible" })

    // verify an editor now contains the new misc code (could be a new block)
    const xEditor = window
      .locator(".cm-editor")
      .filter({ hasText: "x = 5" })
      .first()
    await expect(xEditor).toBeVisible()
    // and the original import block still exists
    await expect(importBlock).toBeVisible()
  })
})
