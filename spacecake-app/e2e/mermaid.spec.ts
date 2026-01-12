import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("mermaid e2e", () => {
  test("open markdown file and render mermaid diagram", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // copy mermaid.md fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/mermaid.md")
    const destPath = path.join(tempTestDir, "mermaid.md")
    fs.copyFileSync(fixturePath, destPath)

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window.getByRole("button", { name: "mermaid.md" }).first().click()

    // verify we're in rich view (not source view)
    await expect(
      window.getByRole("link", { name: "switch to source view" })
    ).toBeVisible()

    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify markdown header is parsed correctly
    await expect(
      window.getByRole("heading", {
        name: "Mermaid Diagram Test",
      })
    ).toBeVisible()

    // verify that the mermaid diagram is rendered as an svg
    await expect(
      window.getByTestId("mermaid-diagram").locator("svg")
    ).toBeVisible()
  })

  test("create mermaid node by typing markdown shortcut", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create a new markdown file
    const filePath = path.join(tempTestDir, "test-create-mermaid.md")
    fs.writeFileSync(filePath, "")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window
      .getByRole("button", { name: "test-create-mermaid.md" })
      .first()
      .click()

    // verify we're in rich view
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // type the mermaid markdown shortcut with a trailing space to trigger transformation
    const editor = window.getByTestId("lexical-editor")
    await editor.click()
    await editor.type("```mermaid ")

    // wait for the mermaid node to be created
    await expect(window.getByTestId("mermaid-node")).toBeVisible()

    // verify it's in code view mode by checking for the code editor
    await expect(window.getByTestId("mermaid-code-editor")).toBeVisible()

    // verify the toggle button exists (which allows switching to diagram view)
    await expect(window.getByTestId("mermaid-toggle-view-mode")).toBeVisible()

    // type a simple mermaid diagram
    const codeEditor = window.getByTestId("mermaid-code-editor")
    await codeEditor.click()

    // find and click the code mirror editor within
    const codeMirror = codeEditor.locator(".cm-editor")
    await expect(codeMirror).toBeVisible()
    await codeMirror.click()

    // type diagram content
    await codeMirror.pressSequentially("graph TD;\n    A-->B;\n    B-->C;")

    // wait a moment for the diagram to update
    await window.waitForTimeout(500)

    // switch to diagram view mode by clicking the toggle button
    const toggleButton = window.getByTestId("mermaid-toggle-view-mode")
    await toggleButton.click()

    // verify that we're now viewing the diagram (code editor should be gone)
    await expect(window.getByTestId("mermaid-code-editor")).not.toBeVisible()

    // verify the svg diagram is rendered
    const mermaidDiagram = window.getByTestId("mermaid-diagram")
    await expect(mermaidDiagram).toBeVisible()

    const svg = mermaidDiagram.locator("svg")
    await expect(svg).toBeVisible()

    // toggle back to code view to verify the diagram code is preserved
    await toggleButton.click()

    // verify we're back in code view
    await expect(window.getByTestId("mermaid-code-editor")).toBeVisible()

    // verify the original diagram code is still there
    const codeEditorAfter = window.getByTestId("mermaid-code-editor")
    await expect(codeEditorAfter.locator(".cm-editor")).toContainText(
      "graph TD;\n    A-->B;\n    B-->C;"
    )

    // test deleting the mermaid node
    const mermaidNode = window.getByTestId("mermaid-node")

    // click the delete button
    await window.getByTestId("block-delete-button").click()

    // verify the mermaid node is gone
    await expect(mermaidNode).not.toBeVisible()
  })
})
