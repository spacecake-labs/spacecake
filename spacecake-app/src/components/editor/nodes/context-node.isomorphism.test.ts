import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import type { Block } from "@/types/parser"
import { nodes } from "@/components/editor/nodes"
import {
  $createContextNode,
  ContextNode,
} from "@/components/editor/nodes/context-node"
import {
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited-node"

const mockBlock: Block<"doc"> = {
  kind: "doc",
  name: { kind: "named", value: "MyDoc" },
  startByte: 0,
  endByte: 100,
  text: "some documentation content",
  startLine: 1,
}

describe("ContextNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for a context node without delimiters", () => {
    editor.update(() => {
      const contextNode = $createContextNode({
        block: mockBlock,
        src: "/path/to/file.py",
      })

      const exported = contextNode.exportJSON()
      const imported = ContextNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getBlock()).toEqual(contextNode.getBlock())
      expect(imported.getSrc()).toBe(contextNode.getSrc())
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for a delimited context node", () => {
    editor.update(() => {
      const contextNode = $createContextNode({
        block: mockBlock,
        src: "/path/to/file.py",
      })
      const delimited = delimitedNode(() => contextNode, {
        prefix: "/**",
        between: "some documentation content",
        suffix: "*/",
      })

      const exported = delimited.exportJSON()
      const imported = ContextNode.importJSON(exported)

      const originalDelimiters = $getDelimiters(delimited)
      const importedDelimiters = $getDelimiters(imported)

      expect(importedDelimiters).toEqual(originalDelimiters)
      expect(imported.getTextContent()).toBe(delimited.getTextContent())
      expect(imported.exportJSON()).toEqual(exported)
    })
  })
})
