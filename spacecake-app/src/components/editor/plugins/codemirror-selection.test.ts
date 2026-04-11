/**
 * @vitest-environment jsdom
 */

import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import {
  cmSelectionToLsp,
  extractCodeMirrorSelectionInfo,
  lspSelectionToCm,
} from "@/lib/selection-utils"

/**
 * These tests verify the exact selection info that gets sent to Claude Code.
 * They use the same extractCodeMirrorSelectionInfo function used in production
 * (codemirror-editor.tsx) to ensure accuracy.
 *
 * The ClaudeSelection format uses 0-based line numbers and character offsets.
 */
describe("CodeMirror Selection -> Claude Integration", () => {
  describe("Single line selections", () => {
    it("should extract correct selection for a word in the middle of a line", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      // Select "World" (positions 6-11)
      const result = extractCodeMirrorSelectionInfo(state, 6, 11)

      expect(result.selectedText).toBe("World")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
        isEmpty: false,
      })
    })

    it("should handle cursor position (empty selection)", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      // Cursor at position 5 (after "Hello")
      const result = extractCodeMirrorSelectionInfo(state, 5, 5)

      expect(result.selectedText).toBe("")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 5 },
        end: { line: 0, character: 5 },
        isEmpty: true,
      })
    })

    it("should handle selection at start of document", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      // Select "Hello"
      const result = extractCodeMirrorSelectionInfo(state, 0, 5)

      expect(result.selectedText).toBe("Hello")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
        isEmpty: false,
      })
    })

    it("should handle selection at end of document", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      // Select "World"
      const result = extractCodeMirrorSelectionInfo(state, 6, 11)

      expect(result.selectedText).toBe("World")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
        isEmpty: false,
      })
    })

    it("should handle entire line selection", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      const result = extractCodeMirrorSelectionInfo(state, 0, 11)

      expect(result.selectedText).toBe("Hello World")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
        isEmpty: false,
      })
    })
  })

  describe("Multi-line selections", () => {
    it("should handle selection spanning two lines", () => {
      // "Line 1" = 6 chars, "\n" = 1 char, "Line 2" starts at offset 7
      const doc = "Line 1\nLine 2"
      const state = EditorState.create({ doc })

      // Select from "ne 1" through "Line" on second line
      // "Li[ne 1\nLine] 2"
      const result = extractCodeMirrorSelectionInfo(state, 2, 11)

      expect(result.selectedText).toBe("ne 1\nLine")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 2 },
        end: { line: 1, character: 4 }, // Line 2 starts at offset 7, 11-7=4
        isEmpty: false,
      })
    })

    it("should handle selection spanning three lines", () => {
      const doc = "Line 1\nLine 2\nLine 3"
      const state = EditorState.create({ doc })

      // Select all of Line 2 including newlines around it
      // Line 1 ends at 6, Line 2 is 7-12, Line 3 starts at 14
      const result = extractCodeMirrorSelectionInfo(state, 7, 13)

      expect(result.selectedText).toBe("Line 2")
      expect(result.claudeSelection).toEqual({
        start: { line: 1, character: 0 },
        end: { line: 1, character: 6 },
        isEmpty: false,
      })
    })

    it("should handle selection from first line to last line", () => {
      const doc = "Line 1\nLine 2\nLine 3"
      const state = EditorState.create({ doc })

      // Select entire document
      const result = extractCodeMirrorSelectionInfo(state, 0, 20)

      expect(result.selectedText).toBe("Line 1\nLine 2\nLine 3")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 2, character: 6 },
        isEmpty: false,
      })
    })
  })

  describe("Backward selections (anchor > head)", () => {
    it("should normalize backward selection to correct range", () => {
      const doc = "Hello World"
      const state = EditorState.create({ doc })

      // Backward selection: anchor=11, head=6 (selecting "World" right-to-left)
      const result = extractCodeMirrorSelectionInfo(state, 11, 6)

      expect(result.selectedText).toBe("World")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
        isEmpty: false,
      })
    })

    it("should normalize backward multi-line selection", () => {
      const doc = "Line 1\nLine 2"
      const state = EditorState.create({ doc })

      // Backward selection from Line 2 to Line 1
      const result = extractCodeMirrorSelectionInfo(state, 11, 2)

      expect(result.selectedText).toBe("ne 1\nLine")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 2 },
        end: { line: 1, character: 4 },
        isEmpty: false,
      })
    })
  })

  describe("Real-world code examples", () => {
    it("should handle TypeScript function definition", () => {
      const doc = `function greet(name: string): string {
  return \`Hello, \${name}!\`
}`
      const state = EditorState.create({ doc })

      // Select the function name "greet"
      const result = extractCodeMirrorSelectionInfo(state, 9, 14)

      expect(result.selectedText).toBe("greet")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 9 },
        end: { line: 0, character: 14 },
        isEmpty: false,
      })
    })

    it("should handle Python code with indentation", () => {
      const doc = `def greet(name):
    return f"Hello, {name}!"

greet("World")`
      const state = EditorState.create({ doc })

      // Select the entire function body (second line)
      // "def greet(name):\n" is 17 chars, Line 2 starts at offset 17
      // "    return f\"Hello, {name}!\"" is 28 chars, ends at 17+28=45
      const line2Start = 17
      const line2End = 45

      const result = extractCodeMirrorSelectionInfo(state, line2Start, line2End)

      expect(result.selectedText).toBe('    return f"Hello, {name}!"')
      expect(result.claudeSelection).toEqual({
        start: { line: 1, character: 0 },
        end: { line: 1, character: 28 },
        isEmpty: false,
      })
    })

    it("should handle markdown with headers", () => {
      const doc = `# Header 1

Some paragraph text.

## Header 2`
      const state = EditorState.create({ doc })

      // Select "Header 1" (characters 2-10 on line 0)
      const result = extractCodeMirrorSelectionInfo(state, 2, 10)

      expect(result.selectedText).toBe("Header 1")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 2 },
        end: { line: 0, character: 10 },
        isEmpty: false,
      })
    })

    it("should handle JSON structure", () => {
      const doc = `{
  "name": "spacecake",
  "version": "1.0.0"
}`
      const state = EditorState.create({ doc })

      // Select the "name" key including quotes (line 1, chars 2-8)
      // Line 0 is "{" (1 char + newline = 2), Line 1 starts at offset 2
      const result = extractCodeMirrorSelectionInfo(state, 4, 10)

      expect(result.selectedText).toBe('"name"')
      expect(result.claudeSelection).toEqual({
        start: { line: 1, character: 2 },
        end: { line: 1, character: 8 },
        isEmpty: false,
      })
    })
  })

  describe("Edge cases", () => {
    it("should handle empty document", () => {
      const doc = ""
      const state = EditorState.create({ doc })

      const result = extractCodeMirrorSelectionInfo(state, 0, 0)

      expect(result.selectedText).toBe("")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
      })
    })

    it("should handle document with only newlines", () => {
      const doc = "\n\n\n"
      const state = EditorState.create({ doc })

      // Cursor on second line
      const result = extractCodeMirrorSelectionInfo(state, 1, 1)

      expect(result.selectedText).toBe("")
      expect(result.claudeSelection).toEqual({
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
        isEmpty: true,
      })
    })

    it("should handle very long line", () => {
      const longText = "a".repeat(1000)
      const doc = longText
      const state = EditorState.create({ doc })

      // Select characters 500-600
      const result = extractCodeMirrorSelectionInfo(state, 500, 600)

      expect(result.selectedText).toBe("a".repeat(100))
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 500 },
        end: { line: 0, character: 600 },
        isEmpty: false,
      })
    })

    it("should handle unicode characters", () => {
      const doc = "Hello 世界 🌍"
      const state = EditorState.create({ doc })

      // Select "世界"
      // "Hello " is 6 chars, "世界" starts at 6
      const result = extractCodeMirrorSelectionInfo(state, 6, 8)

      expect(result.selectedText).toBe("世界")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 6 },
        end: { line: 0, character: 8 },
        isEmpty: false,
      })
    })

    it("should handle tabs", () => {
      const doc = "\t\tindented"
      const state = EditorState.create({ doc })

      // Select "indented"
      const result = extractCodeMirrorSelectionInfo(state, 2, 10)

      expect(result.selectedText).toBe("indented")
      expect(result.claudeSelection).toEqual({
        start: { line: 0, character: 2 },
        end: { line: 0, character: 10 },
        isEmpty: false,
      })
    })
  })

  describe("Line number accuracy (critical for Claude)", () => {
    /**
     * These tests specifically verify that line numbers match what Claude Code
     * expects. Claude uses 0-based line numbers, while CodeMirror uses 1-based.
     */

    it("should report line 0 for first line", () => {
      const doc = "first line\nsecond line"
      const state = EditorState.create({ doc })

      const result = extractCodeMirrorSelectionInfo(state, 0, 5)

      expect(result.claudeSelection.start.line).toBe(0)
      expect(result.claudeSelection.end.line).toBe(0)
    })

    it("should report line 1 for second line", () => {
      const doc = "first line\nsecond line"
      const state = EditorState.create({ doc })

      // "first line\n" is 11 chars, "second" starts at 11
      const result = extractCodeMirrorSelectionInfo(state, 11, 17)

      expect(result.selectedText).toBe("second")
      expect(result.claudeSelection.start.line).toBe(1)
      expect(result.claudeSelection.end.line).toBe(1)
    })

    it("should correctly report character offset within line", () => {
      const doc = "first line\nsecond line"
      const state = EditorState.create({ doc })

      // Select "cond" on the second line (characters 2-6 within that line)
      // Line 2 starts at offset 11, so "cond" is at 11+2=13 to 11+6=17
      const result = extractCodeMirrorSelectionInfo(state, 13, 17)

      expect(result.selectedText).toBe("cond")
      expect(result.claudeSelection).toEqual({
        start: { line: 1, character: 2 },
        end: { line: 1, character: 6 },
        isEmpty: false,
      })
    })
  })
})

describe("LspSelection conversion isomorphism", () => {
  const makeState = (doc: string) => EditorState.create({ doc })

  describe("CM → Lsp → CM roundtrip", () => {
    const roundtrip = (doc: string, anchor: number, head: number) => {
      const state = makeState(doc)
      const lsp = cmSelectionToLsp(state, anchor, head)
      const restored = lspSelectionToCm(state.doc, lsp)
      return restored
    }

    it("preserves cursor position (empty selection)", () => {
      expect(roundtrip("hello world", 5, 5)).toEqual({ anchor: 5, head: 5 })
    })

    it("preserves forward selection on single line", () => {
      expect(roundtrip("hello world", 6, 11)).toEqual({ anchor: 6, head: 11 })
    })

    it("preserves backward selection on single line", () => {
      expect(roundtrip("hello world", 11, 6)).toEqual({ anchor: 11, head: 6 })
    })

    it("preserves multi-line selection", () => {
      const doc = "line 1\nline 2\nline 3"
      expect(roundtrip(doc, 2, 11)).toEqual({ anchor: 2, head: 11 })
    })

    it("preserves backward multi-line selection", () => {
      const doc = "line 1\nline 2\nline 3"
      expect(roundtrip(doc, 11, 2)).toEqual({ anchor: 11, head: 2 })
    })

    it("preserves start of document", () => {
      expect(roundtrip("hello", 0, 0)).toEqual({ anchor: 0, head: 0 })
    })

    it("preserves end of document", () => {
      expect(roundtrip("hello", 5, 5)).toEqual({ anchor: 5, head: 5 })
    })

    it("preserves selection spanning entire document", () => {
      const doc = "line 1\nline 2"
      expect(roundtrip(doc, 0, 13)).toEqual({ anchor: 0, head: 13 })
    })

    it("preserves unicode content", () => {
      const doc = "hello 世界 🌍"
      expect(roundtrip(doc, 6, 8)).toEqual({ anchor: 6, head: 8 })
    })

    it("preserves tabs", () => {
      expect(roundtrip("\t\tindented", 2, 10)).toEqual({ anchor: 2, head: 10 })
    })

    it("preserves selection at newline boundary", () => {
      const doc = "line 1\nline 2"
      // select just the newline
      expect(roundtrip(doc, 6, 7)).toEqual({ anchor: 6, head: 7 })
    })

    it("preserves empty document", () => {
      expect(roundtrip("", 0, 0)).toEqual({ anchor: 0, head: 0 })
    })
  })

  describe("Lsp → CM → Lsp roundtrip", () => {
    const roundtrip = (
      doc: string,
      anchorLine: number,
      anchorChar: number,
      headLine: number,
      headChar: number,
    ) => {
      const state = makeState(doc)
      const lsp = {
        _tag: "Lsp" as const,
        anchor: { line: anchorLine, character: anchorChar },
        head: { line: headLine, character: headChar },
      }
      const cm = lspSelectionToCm(state.doc, lsp)
      return cmSelectionToLsp(state, cm.anchor, cm.head)
    }

    it("preserves cursor at start of document", () => {
      expect(roundtrip("hello", 0, 0, 0, 0)).toEqual({
        _tag: "Lsp",
        anchor: { line: 0, character: 0 },
        head: { line: 0, character: 0 },
      })
    })

    it("preserves forward selection on single line", () => {
      expect(roundtrip("hello world", 0, 6, 0, 11)).toEqual({
        _tag: "Lsp",
        anchor: { line: 0, character: 6 },
        head: { line: 0, character: 11 },
      })
    })

    it("preserves backward selection on single line", () => {
      expect(roundtrip("hello world", 0, 11, 0, 6)).toEqual({
        _tag: "Lsp",
        anchor: { line: 0, character: 11 },
        head: { line: 0, character: 6 },
      })
    })

    it("preserves multi-line selection", () => {
      expect(roundtrip("line 1\nline 2\nline 3", 0, 2, 1, 4)).toEqual({
        _tag: "Lsp",
        anchor: { line: 0, character: 2 },
        head: { line: 1, character: 4 },
      })
    })

    it("preserves end of line position", () => {
      expect(roundtrip("hello\nworld", 0, 5, 0, 5)).toEqual({
        _tag: "Lsp",
        anchor: { line: 0, character: 5 },
        head: { line: 0, character: 5 },
      })
    })

    it("preserves start of second line", () => {
      expect(roundtrip("hello\nworld", 1, 0, 1, 0)).toEqual({
        _tag: "Lsp",
        anchor: { line: 1, character: 0 },
        head: { line: 1, character: 0 },
      })
    })
  })

  describe("lspSelectionToCm clamping", () => {
    it("clamps character past end of line", () => {
      const state = makeState("hi")
      const lsp = {
        _tag: "Lsp" as const,
        anchor: { line: 0, character: 100 },
        head: { line: 0, character: 100 },
      }
      const cm = lspSelectionToCm(state.doc, lsp)
      expect(cm).toEqual({ anchor: 2, head: 2 })
    })

    it("clamps line past end of document", () => {
      const state = makeState("hi")
      const lsp = {
        _tag: "Lsp" as const,
        anchor: { line: 99, character: 0 },
        head: { line: 99, character: 0 },
      }
      const cm = lspSelectionToCm(state.doc, lsp)
      // should clamp to last line
      expect(cm.anchor).toBe(state.doc.line(state.doc.lines).from)
    })
  })
})
