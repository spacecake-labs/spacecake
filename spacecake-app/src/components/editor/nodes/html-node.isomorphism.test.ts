import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import { $createHTMLBlockNode, HTMLBlockNode } from "@/components/editor/nodes/html-node"

describe("HTMLBlockNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with default view mode", () => {
    editor.update(() => {
      const html =
        '<picture>\n  <source srcset="dark.png" media="(prefers-color-scheme: dark)" />\n  <img src="light.png" alt="screenshot" />\n</picture>'
      const htmlNode = $createHTMLBlockNode({ html })

      const exported = htmlNode.exportJSON()
      const imported = HTMLBlockNode.importJSON(exported)

      expect(imported.getHtml()).toBe(htmlNode.getHtml())
      expect(imported.getViewMode()).toBe("preview")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with code view mode", () => {
    editor.update(() => {
      const html = "<div>\n  <p>hello world</p>\n</div>"
      const htmlNode = $createHTMLBlockNode({
        html,
        viewMode: "code",
      })

      const exported = htmlNode.exportJSON()
      const imported = HTMLBlockNode.importJSON(exported)

      expect(imported.getHtml()).toBe(htmlNode.getHtml())
      expect(imported.getViewMode()).toBe("code")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with preview view mode", () => {
    editor.update(() => {
      const html =
        "<table>\n  <thead><tr><th>name</th></tr></thead>\n  <tbody><tr><td>value</td></tr></tbody>\n</table>"
      const htmlNode = $createHTMLBlockNode({
        html,
        viewMode: "preview",
      })

      const exported = htmlNode.exportJSON()
      const imported = HTMLBlockNode.importJSON(exported)

      expect(imported.getHtml()).toBe(htmlNode.getHtml())
      expect(imported.getViewMode()).toBe("preview")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that getTextContent returns the raw html", () => {
    editor.update(() => {
      const html = "<details>\n  <summary>click me</summary>\n  <p>hidden content</p>\n</details>"
      const htmlNode = $createHTMLBlockNode({ html })

      expect(htmlNode.getTextContent()).toBe(html)
    })
  })
})
