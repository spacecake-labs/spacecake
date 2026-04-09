import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import { $createWikiLinkNode, WikiLinkNode } from "@/components/editor/nodes/wikilink-node"

describe("WikiLinkNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({ nodes })
  })

  it("exportJSON/importJSON roundtrips with target only", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note", alias: null })
      const exported = node.exportJSON()
      const imported = WikiLinkNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getTarget()).toBe("my-note")
      expect(imported.getAlias()).toBeNull()
    })
  })

  it("exportJSON/importJSON roundtrips with target and alias", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note", alias: "display text" })
      const exported = node.exportJSON()
      const imported = WikiLinkNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getTarget()).toBe("my-note")
      expect(imported.getAlias()).toBe("display text")
    })
  })

  it("exportJSON/importJSON roundtrips with heading anchor", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note#introduction", alias: null })
      const exported = node.exportJSON()
      const imported = WikiLinkNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getTarget()).toBe("my-note#introduction")
    })
  })

  it("exportJSON/importJSON roundtrips with block reference", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note#^abc123", alias: null })
      const exported = node.exportJSON()
      const imported = WikiLinkNode.importJSON(exported)

      expect(imported.exportJSON()).toEqual(exported)
      expect(imported.getTarget()).toBe("my-note#^abc123")
    })
  })

  it("getTextContent returns alias when present", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note", alias: "click here" })
      expect(node.getTextContent()).toBe("click here")
    })
  })

  it("getTextContent returns target when alias is null", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "my-note", alias: null })
      expect(node.getTextContent()).toBe("my-note")
    })
  })

  it("isInline returns true", () => {
    editor.update(() => {
      const node = $createWikiLinkNode({ target: "test", alias: null })
      expect(node.isInline()).toBe(true)
    })
  })
})
