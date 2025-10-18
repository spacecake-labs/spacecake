import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import {
  $createContainerNode,
  ContainerNode,
} from "@/components/editor/nodes/container-node"
import {
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited-node"

describe("ContainerNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for a delimited container node with empty delimiters", () => {
    editor.update(() => {
      const container = $createContainerNode()
      const delimited = delimitedNode(() => container, {
        prefix: "",
        between: "some content",
        suffix: "",
      })

      const exported = delimited.exportJSON()
      const imported = ContainerNode.importJSON(exported)

      const originalDelimiters = $getDelimiters(delimited)
      const importedDelimiters = $getDelimiters(imported)

      expect(importedDelimiters).toEqual(originalDelimiters)
      expect(imported.getTextContent()).toBe(delimited.getTextContent())
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic for container node with non-empty delimiters", () => {
    editor.update(() => {
      const container = $createContainerNode()
      const delimited = delimitedNode(() => container, {
        prefix: "prefix",
        between: "some content",
        suffix: "suffix",
      })

      const exported = delimited.exportJSON()
      const imported = ContainerNode.importJSON(exported)

      const originalDelimiters = $getDelimiters(delimited)
      const importedDelimiters = $getDelimiters(imported)

      expect(importedDelimiters).toEqual(originalDelimiters)
      expect(imported.getTextContent()).toBe(delimited.getTextContent())
      expect(imported.exportJSON()).toEqual(exported)
    })
  })
})
