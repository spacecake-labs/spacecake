/**
 * @vitest-environment jsdom
 */

import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { extractCodeMirrorSelectionInfo } from "@/lib/selection-utils"

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
