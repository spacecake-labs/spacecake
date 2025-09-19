import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Language, Parser } from "web-tree-sitter"

import languages from "@/lib/parser/languages"
import {
  dedentDocstring,
  findDocstringNode,
} from "@/lib/parser/python/docstring"

let Python: Language

describe("Python docstring utilities", () => {
  let parser: Parser

  beforeAll(async () => {
    ;({ Python } = await languages)
  })

  beforeEach(() => {
    parser = new Parser()
    parser.setLanguage(Python)
  })

  afterEach(() => {
    parser.delete()
  })

  describe("findDocstringNode", () => {
    it("finds docstring in function", async () => {
      const code = `def f():
    """A function docstring."""
    pass`
      const tree = parser.parse(code)
      if (!tree) throw new Error("failed to parse code")
      const functionNode = tree.rootNode.firstChild
      if (!functionNode) throw new Error("failed to get function node")

      const docstringNode = findDocstringNode(functionNode)
      expect(docstringNode).not.toBeNull()
      expect(docstringNode?.text).toBe('"""A function docstring."""')
    })

    it("finds docstring in class", async () => {
      const code = `class MyClass:
    """A class docstring."""
    
    def method(self):
        return "hello"`
      const tree = parser.parse(code)
      if (!tree) throw new Error("failed to parse code")
      const classNode = tree.rootNode.firstChild
      if (!classNode) throw new Error("failed to get class node")

      const docstringNode = findDocstringNode(classNode)
      expect(docstringNode).not.toBeNull()
      expect(docstringNode?.text).toBe('"""A class docstring."""')
    })
  })

  describe("dedentDocstring", () => {
    it("handles empty docstring", () => {
      expect(dedentDocstring("")).toBe("")
      expect(dedentDocstring('""""""')).toBe("")
    })

    it("removes leading and trailing blank lines", () => {
      const docstring = `


    This is a docstring.
    

`
      expect(dedentDocstring(docstring)).toBe("This is a docstring.")
    })

    it("dedents multi-line docstring with uniform indentation", () => {
      const docstring = `
    This is the second line of the docstring.
    This is the third line.
`
      expect(dedentDocstring(docstring)).toBe(
        "This is the second line of the docstring.\nThis is the third line."
      )
    })

    it("handles example from specification - foo function", () => {
      const docstring = `
    This is the second line of the docstring.
    `
      expect(dedentDocstring(docstring)).toBe(
        "This is the second line of the docstring."
      )
    })

    it("handles example from specification - equivalent docstrings", () => {
      const docstring1 = `A multi-line
    docstring.
    `
      const docstring2 = `
    A multi-line
    docstring.
    `

      const result1 = dedentDocstring(docstring1)
      const result2 = dedentDocstring(docstring2)

      expect(result1).toBe("A multi-line\ndocstring.")
      expect(result2).toBe("A multi-line\ndocstring.")
      expect(result1).toBe(result2)
    })

    it("preserves relative indentation", () => {
      const docstring = `
    This is the main line.
        This is indented more.
    This is back to normal.
      This is slightly indented.
`
      expect(dedentDocstring(docstring)).toBe(
        "This is the main line.\n    This is indented more.\nThis is back to normal.\n  This is slightly indented."
      )
    })

    it("handles tabs by converting to spaces", () => {
      const docstring = `
\tThis line has tabs.
\t\tThis line has more tabs.
`
      expect(dedentDocstring(docstring)).toBe(
        "This line has tabs.\n    This line has more tabs."
      )
    })

    it("handles single line docstring", () => {
      const docstring = "    A single line docstring."
      expect(dedentDocstring(docstring)).toBe("A single line docstring.")
    })

    it("handles docstring with only whitespace lines", () => {
      const docstring = `
    

`
      expect(dedentDocstring(docstring)).toBe("")
    })
  })
})
