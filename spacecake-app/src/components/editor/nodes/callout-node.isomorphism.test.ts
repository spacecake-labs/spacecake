import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import { $createCalloutNode, CalloutNode } from "@/components/editor/nodes/callout-node"

describe("CalloutNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({ nodes: nodes })
  })

  it("round-trips a minimal note callout through JSON", () => {
    editor.update(() => {
      const node = $createCalloutNode({ type: "note" })
      const exported = node.exportJSON()
      const imported = CalloutNode.importJSON(exported)

      expect(imported.getCalloutType()).toBe("note")
      expect(imported.getTitle()).toBe("")
      expect(imported.getFoldable()).toBe(false)
      expect(imported.getDefaultOpen()).toBe(true)
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("round-trips all metadata fields", () => {
    editor.update(() => {
      const node = $createCalloutNode({
        type: "warning",
        title: "Watch out!",
        foldable: true,
        defaultOpen: false,
      })
      const exported = node.exportJSON()
      const imported = CalloutNode.importJSON(exported)

      expect(imported.getCalloutType()).toBe("warning")
      expect(imported.getTitle()).toBe("Watch out!")
      expect(imported.getFoldable()).toBe(true)
      expect(imported.getDefaultOpen()).toBe(false)
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("normalizes unknown types to note on import", () => {
    editor.update(() => {
      const node = $createCalloutNode({ type: "note" })
      const exported = node.exportJSON()
      // simulate an older/foreign json blob with a non-canonical type string
      const tampered = { ...exported, calloutType: "xyzzy" as never }
      const imported = CalloutNode.importJSON(tampered)

      expect(imported.getCalloutType()).toBe("note")
    })
  })
})
