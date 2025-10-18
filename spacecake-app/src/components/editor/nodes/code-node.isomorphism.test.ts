import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import {
  $createCodeBlockNode,
  CodeBlockNode,
} from "@/components/editor/nodes/code-node"
import {
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited-node"

describe("CodeNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for a code node without delimiters", () => {
    editor.update(() => {
      const codeNode = $createCodeBlockNode({
        code: "console.log('hello world')",
        language: "javascript",
        meta: "meta string",
      })

      const exported = codeNode.exportJSON()
      const imported = CodeBlockNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getCode()).toBe(codeNode.getCode())
      expect(imported.getLanguage()).toBe(codeNode.getLanguage())
      expect(imported.getMeta()).toBe(codeNode.getMeta())
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for a delimited code node", () => {
    editor.update(() => {
      const codeNode = $createCodeBlockNode({
        code: "console.log('hello world')",
        language: "javascript",
        meta: "meta string",
      })
      const delimited = delimitedNode(() => codeNode, {
        prefix: "\n\n",
        between: "console.log('hello world')",
        suffix: "\n",
      })

      const exported = delimited.exportJSON()
      const imported = CodeBlockNode.importJSON(exported)

      const originalDelimiters = $getDelimiters(delimited)
      const importedDelimiters = $getDelimiters(imported)

      expect(importedDelimiters).toEqual(originalDelimiters)
      expect(imported.getTextContent()).toBe(delimited.getTextContent())
      expect(imported.exportJSON()).toEqual(exported)
    })
  })
})
