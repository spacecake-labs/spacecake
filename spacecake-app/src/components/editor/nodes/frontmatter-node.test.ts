import { $convertFromMarkdownString } from "@lexical/markdown"
import { $getRoot, createEditor, LexicalEditor, ParagraphNode } from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { nodes } from "@/components/editor/nodes"
import {
  $createFrontmatterNode,
  $isFrontmatterNode,
  FrontmatterNode,
} from "@/components/editor/nodes/frontmatter-node"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

describe("FrontmatterNode isomorphism", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with default view mode (table)", () => {
    editor.update(() => {
      const yaml = "title: My Document\nauthor: John Doe"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const exported = frontmatterNode.exportJSON()
      const imported = FrontmatterNode.importJSON(exported)

      expect(imported.getYaml()).toBe(frontmatterNode.getYaml())
      expect(imported.getViewMode()).toBe("table")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with code view mode", () => {
    editor.update(() => {
      const yaml = "title: Test\nversion: 1.0.0"
      const frontmatterNode = $createFrontmatterNode({
        yaml,
        viewMode: "code",
      })

      const exported = frontmatterNode.exportJSON()
      const imported = FrontmatterNode.importJSON(exported)

      expect(imported.getYaml()).toBe(frontmatterNode.getYaml())
      expect(imported.getViewMode()).toBe("code")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that exportJSON/importJSON is isomorphic with table view mode explicitly set", () => {
    editor.update(() => {
      const yaml = "tags:\n  - one\n  - two\n  - three"
      const frontmatterNode = $createFrontmatterNode({
        yaml,
        viewMode: "table",
      })

      const exported = frontmatterNode.exportJSON()
      const imported = FrontmatterNode.importJSON(exported)

      expect(imported.getYaml()).toBe(frontmatterNode.getYaml())
      expect(imported.getViewMode()).toBe("table")
      expect(imported.exportJSON()).toEqual(exported)
    })
  })

  it("tests that getTextContent returns the yaml", () => {
    editor.update(() => {
      const yaml = "title: Hello World\ndescription: A test document"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      expect(frontmatterNode.getTextContent()).toBe(yaml)
    })
  })
})

describe("FrontmatterNode getParsedData", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("parses valid YAML correctly", () => {
    editor.update(() => {
      const yaml = "title: Test\nauthor: Jane"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(error).toBeNull()
      expect(data).toEqual({ title: "Test", author: "Jane" })
    })
  })

  it("handles empty YAML", () => {
    editor.update(() => {
      const yaml = ""
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(error).toBeNull()
      expect(data).toEqual({})
    })
  })

  it("handles whitespace-only YAML", () => {
    editor.update(() => {
      const yaml = "   \n  \n   "
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(error).toBeNull()
      expect(data).toEqual({})
    })
  })

  it("returns error for non-object YAML (string)", () => {
    editor.update(() => {
      const yaml = "just a string"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(data).toBeNull()
      expect(error).toBe("Frontmatter must be a YAML object (key-value pairs)")
    })
  })

  it("returns error for non-object YAML (array)", () => {
    editor.update(() => {
      const yaml = "- item1\n- item2"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(data).toBeNull()
      expect(error).toBe("Frontmatter must be a YAML object (key-value pairs)")
    })
  })

  it("returns error for invalid YAML syntax", () => {
    editor.update(() => {
      const yaml = "invalid: yaml: syntax:"
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(data).toBeNull()
      expect(error).toBeTruthy()
    })
  })

  it("handles complex nested YAML", () => {
    editor.update(() => {
      const yaml = `title: Complex Document
metadata:
  version: 1.0.0
  tags:
    - tag1
    - tag2
author: John Doe`
      const frontmatterNode = $createFrontmatterNode({ yaml })

      const { data, error } = frontmatterNode.getParsedData()

      expect(error).toBeNull()
      expect(data).toEqual({
        title: "Complex Document",
        metadata: {
          version: "1.0.0",
          tags: ["tag1", "tag2"],
        },
        author: "John Doe",
      })
    })
  })
})

describe("FrontmatterNode type guard and creation", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("$isFrontmatterNode returns true for FrontmatterNode", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({ yaml: "title: Test" })

      expect($isFrontmatterNode(frontmatterNode)).toBe(true)
    })
  })

  it("$isFrontmatterNode returns false for other nodes", () => {
    editor.update(() => {
      const paragraphNode = new ParagraphNode()

      expect($isFrontmatterNode(paragraphNode)).toBe(false)
    })
  })

  it("$isFrontmatterNode returns false for null", () => {
    editor.update(() => {
      expect($isFrontmatterNode(null)).toBe(false)
    })
  })

  it("$isFrontmatterNode returns false for undefined", () => {
    editor.update(() => {
      expect($isFrontmatterNode(undefined)).toBe(false)
    })
  })

  it("creates node with correct type", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({ yaml: "title: Test" })

      expect(FrontmatterNode.getType()).toBe("frontmatter")
      expect(frontmatterNode.exportJSON().type).toBe("frontmatter")
    })
  })

  it("creates node with correct version", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({ yaml: "title: Test" })

      expect(frontmatterNode.exportJSON().version).toBe(1)
    })
  })
})

describe("FrontmatterNode setters", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("setYaml updates the yaml content", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({
        yaml: "title: Original",
      })

      expect(frontmatterNode.getYaml()).toBe("title: Original")

      frontmatterNode.setYaml("title: Updated")

      expect(frontmatterNode.getYaml()).toBe("title: Updated")
    })
  })

  it("setViewMode updates the view mode", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({ yaml: "title: Test" })

      expect(frontmatterNode.getViewMode()).toBe("table")

      frontmatterNode.setViewMode("code")

      expect(frontmatterNode.getViewMode()).toBe("code")

      frontmatterNode.setViewMode("table")

      expect(frontmatterNode.getViewMode()).toBe("table")
    })
  })
})

describe("FrontmatterNode clone", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("clone creates a copy with same properties", () => {
    editor.update(() => {
      const original = $createFrontmatterNode({
        yaml: "title: Original",
        viewMode: "code",
      })

      const cloned = FrontmatterNode.clone(original)

      expect(cloned.getYaml()).toBe(original.getYaml())
      expect(cloned.getViewMode()).toBe(original.getViewMode())
      expect(cloned.getKey()).toBe(original.getKey())
    })
  })
})

describe("FrontmatterNode isInline", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      nodes: nodes,
    })
  })

  it("isInline returns false (frontmatter is always a block)", () => {
    editor.update(() => {
      const frontmatterNode = $createFrontmatterNode({ yaml: "title: Test" })

      expect(frontmatterNode.isInline()).toBe(false)
    })
  })
})

describe("FrontmatterNode integration with markdown parsing", () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({ nodes })
  })

  it("should parse markdown file with frontmatter and create FrontmatterNode as first child", () => {
    const markdownContent = `---
name: explaining-code
description: Explains code with visual diagrams and analogies. Use when explaining how code works, teaching about a codebase, or when the user asks "how does this work?"
---

When explaining code, always include:

1. **Start with an analogy**: Compare the code to something from everyday life
2. **Draw a diagram**: Use ASCII art to show the flow, structure, or relationships
3. **Walk through the code**: Explain step-by-step what happens
4. **Highlight a gotcha**: What's a common mistake or misconception?

Keep explanations conversational. For complex concepts, use multiple analogies.
`

    editor.update(
      () => {
        $convertFromMarkdownString(
          markdownContent,
          MARKDOWN_TRANSFORMERS,
          undefined,
          true
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()

      // First child should be frontmatter node
      expect(children.length).toBeGreaterThan(0)
      expect($isFrontmatterNode(children[0])).toBe(true)

      const frontmatterNode = children[0] as FrontmatterNode
      expect(frontmatterNode.getViewMode()).toBe("table")

      // Verify the YAML content is parsed correctly
      const { data, error } = frontmatterNode.getParsedData()
      expect(error).toBeNull()
      expect(data).toEqual({
        name: "explaining-code",
        description:
          'Explains code with visual diagrams and analogies. Use when explaining how code works, teaching about a codebase, or when the user asks "how does this work?"',
      })

      // Verify there are subsequent nodes (paragraphs, lists, etc.)
      expect(children.length).toBeGreaterThan(1)

      // There's an empty paragraph after frontmatter, then the content paragraph
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")

      // Third child should be a paragraph with "When explaining code, always include:"
      expect(children[2].getType()).toBe("paragraph")
      expect(children[2].getTextContent()).toBe(
        "When explaining code, always include:"
      )
    })
  })

  it("should parse markdown with empty frontmatter", () => {
    const markdownContent = `---
---

# Hello World

This is a test.
`

    editor.update(
      () => {
        $convertFromMarkdownString(
          markdownContent,
          MARKDOWN_TRANSFORMERS,
          undefined,
          true
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()

      // First child should be frontmatter node
      expect($isFrontmatterNode(children[0])).toBe(true)

      const frontmatterNode = children[0] as FrontmatterNode
      const { data, error } = frontmatterNode.getParsedData()
      expect(error).toBeNull()
      expect(data).toEqual({})

      // Should have empty paragraph then heading after frontmatter
      expect(children.length).toBeGreaterThan(2)
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")
      expect(children[2].getType()).toBe("heading")
      expect(children[2].getTextContent()).toBe("Hello World")
    })
  })

  it("should parse markdown without frontmatter (no FrontmatterNode created)", () => {
    const markdownContent = `# Just a Heading

Some paragraph content.
`

    editor.update(
      () => {
        $convertFromMarkdownString(
          markdownContent,
          MARKDOWN_TRANSFORMERS,
          undefined,
          true
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()

      // First child should NOT be frontmatter
      expect($isFrontmatterNode(children[0])).toBe(false)

      // First child should be the heading
      expect(children[0].getType()).toBe("heading")
      expect(children[0].getTextContent()).toBe("Just a Heading")
    })
  })

  it("should parse frontmatter with complex nested YAML", () => {
    const markdownContent = `---
title: Complex Document
metadata:
  version: 1.0.0
  tags:
    - tag1
    - tag2
author: John Doe
---

Content after frontmatter.
`

    editor.update(
      () => {
        $convertFromMarkdownString(
          markdownContent,
          MARKDOWN_TRANSFORMERS,
          undefined,
          true
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()

      expect($isFrontmatterNode(children[0])).toBe(true)

      const frontmatterNode = children[0] as FrontmatterNode
      const { data, error } = frontmatterNode.getParsedData()
      expect(error).toBeNull()
      expect(data).toEqual({
        title: "Complex Document",
        metadata: {
          version: "1.0.0",
          tags: ["tag1", "tag2"],
        },
        author: "John Doe",
      })
    })
  })
})
