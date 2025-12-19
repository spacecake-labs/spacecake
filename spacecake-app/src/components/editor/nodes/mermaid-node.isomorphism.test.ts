import { createEditor, LexicalEditor } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import {
  $createMermaidNode,
  MermaidNode,
} from "@/components/editor/nodes/mermaid-node"

describe("MermaidNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with default view mode", () => {
    editor.update(() => {
      const diagram = "graph TD;\n    A-->B;\n    B-->C;"
      const mermaidNode = $createMermaidNode({ diagram })

      const exported = mermaidNode.exportJSON()
      const imported = MermaidNode.importJSON(exported)

      expect(imported.getDiagram()).toBe(mermaidNode.getDiagram())
      expect(imported.getViewMode()).toBe("diagram")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with code view mode", () => {
    editor.update(() => {
      const diagram = "graph LR;\n    A[Start]-->B[End];"
      const mermaidNode = $createMermaidNode({
        diagram,
        viewMode: "code",
      })

      const exported = mermaidNode.exportJSON()
      const imported = MermaidNode.importJSON(exported)

      expect(imported.getDiagram()).toBe(mermaidNode.getDiagram())
      expect(imported.getViewMode()).toBe("code")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with diagram view mode", () => {
    editor.update(() => {
      const diagram =
        "sequenceDiagram\n    participant A\n    participant B\n    A->>B: Hello"
      const mermaidNode = $createMermaidNode({
        diagram,
        viewMode: "diagram",
      })

      const exported = mermaidNode.exportJSON()
      const imported = MermaidNode.importJSON(exported)

      expect(imported.getDiagram()).toBe(mermaidNode.getDiagram())
      expect(imported.getViewMode()).toBe("diagram")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that getTextContent returns the diagram", () => {
    editor.update(() => {
      const diagram =
        "pie\n    title Pie Chart\n    section A: 30\n    section B: 70"
      const mermaidNode = $createMermaidNode({ diagram })

      expect(mermaidNode.getTextContent()).toBe(diagram)
    })
  })
})
