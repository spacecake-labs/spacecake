import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node"
import {
  $getDelimitedString,
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited-node"

describe("delimited-node", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("should attach and retrieve delimiters from a node", () => {
    editor.update(() => {
      const nodeCreator = (content: string) =>
        $createCodeBlockNode({
          code: content,
          language: "javascript",
        })

      const delimited = delimitedNode(nodeCreator, {
        prefix: "\n\n",
        between: "console.log('hello world')",
        suffix: "\n",
      })

      const delimiters = $getDelimiters(delimited)

      expect(delimited.getTextContent()).toBe("console.log('hello world')")
      expect(delimiters).toEqual({
        prefix: "\n\n",
        suffix: "\n",
      })
    })
  })

  it("should reconstruct the full delimited string from a node", () => {
    editor.update(() => {
      const nodeCreator = (content: string) =>
        $createCodeBlockNode({
          code: content,
          language: "javascript",
        })

      const delimited = delimitedNode(nodeCreator, {
        prefix: "prefix",
        between: "console.log('hello world')",
        suffix: "suffix",
      })

      const delimitedString = $getDelimitedString(delimited)

      expect(delimitedString).toBe("prefixconsole.log('hello world')suffix")
    })
  })

  it("should handle empty delimiters", () => {
    editor.update(() => {
      const nodeCreator = (content: string) =>
        $createCodeBlockNode({
          code: content,
          language: "plaintext",
        })

      const delimited = delimitedNode(nodeCreator, {
        prefix: "",
        between: "test",
        suffix: "",
      })

      const delimiters = $getDelimiters(delimited)
      expect(delimiters).toEqual({ prefix: "", suffix: "" })

      const delimitedString = $getDelimitedString(delimited)
      expect(delimitedString).toBe("test")
    })
  })

  it("should return an empty string for a node without content", () => {
    editor.update(() => {
      const nodeCreator = (content: string) =>
        $createCodeBlockNode({
          code: content,
          language: "plaintext",
        })

      const delimited = delimitedNode(nodeCreator, {
        prefix: "/*",
        between: "",
        suffix: "*/",
      })

      const delimitedString = $getDelimitedString(delimited)
      expect(delimitedString).toBe("/**/")
    })
  })
})
