/**
 * @vitest-environment jsdom
 */

import * as React from "react"
import { act } from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from "lexical"
import { describe, expect, it, vi } from "vitest"

import {
  createRichViewClaudeSelection,
  createSourceViewClaudeSelection,
} from "@/lib/selection-utils"
import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { initializeUnitTest } from "@/components/editor/test-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

// Mock web-tree-sitter and language parser as in previous setup
vi.mock("web-tree-sitter", () => {
  return {
    Parser: class {
      static init = vi.fn()
      setLanguage = vi.fn()
      parse = vi.fn(() => ({
        rootNode: {
          children: [],
        },
      }))
    },
  }
})

vi.mock("@/lib/parser/languages", () => {
  const mockQuery = {
    exec: () => [],
  }

  const mockLanguage = {
    query: () => mockQuery,
  }

  return {
    default: Promise.resolve({
      Markdown: mockLanguage,
    }),
  }
})

const Plugins = React.memo(function Plugins() {
  return (
    <RichTextPlugin
      contentEditable={
        <ContentEditable placeholder={""} className="ContentEditable__root" />
      }
      ErrorBoundary={LexicalErrorBoundary}
    />
  )
})

describe("selection-utils", () => {
  /**
   * Pure function tests for createRichViewClaudeSelection
   *
   * Rich view doesn't map to specific source lines, so we treat selections
   * as a single block from (0,0) to (0, text.length).
   */
  describe("createRichViewClaudeSelection", () => {
    it("should create correct selection for single word", () => {
      const text = "Hello"
      const selection = createRichViewClaudeSelection(text)

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
        isEmpty: false,
      })
    })

    it("should create correct selection for sentence", () => {
      const text = "Hello world, this is a test."
      const selection = createRichViewClaudeSelection(text)

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: text.length },
        isEmpty: false,
      })
    })

    it("should create correct selection for empty text", () => {
      const text = ""
      const selection = createRichViewClaudeSelection(text)

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
      })
    })

    it("should handle multi-line selected text", () => {
      // Even though the text has newlines, rich view treats it as a single block
      const text = "Line 1\nLine 2\nLine 3"
      const selection = createRichViewClaudeSelection(text)

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: text.length },
        isEmpty: false,
      })
    })

    it("should handle unicode text", () => {
      const text = "Hello 世界 🌍"
      const selection = createRichViewClaudeSelection(text)

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: text.length },
        isEmpty: false,
      })
    })
  })

  /**
   * Pure function tests for createSourceViewClaudeSelection
   *
   * Source view maps directly to file lines, using 0-based line numbers
   * for Claude (CodeMirror internally uses 1-based).
   */
  describe("createSourceViewClaudeSelection", () => {
    it("should correctly convert 1-based line numbers to 0-based", () => {
      const selection = createSourceViewClaudeSelection({
        startLineNumber: 10,
        startLineStartOffset: 100,
        endLineNumber: 10,
        endLineStartOffset: 100,
        selectionFrom: 104,
        selectionTo: 109,
      })

      expect(selection).toEqual({
        start: { line: 9, character: 4 }, // 104 - 100 = 4
        end: { line: 9, character: 9 }, // 109 - 100 = 9
        isEmpty: false,
      })
    })

    it("should handle multi-line selections", () => {
      const selection = createSourceViewClaudeSelection({
        startLineNumber: 1,
        startLineStartOffset: 0,
        endLineNumber: 2,
        endLineStartOffset: 11,
        selectionFrom: 5,
        selectionTo: 13, // 11 + 2
      })

      expect(selection).toEqual({
        start: { line: 0, character: 5 },
        end: { line: 1, character: 2 },
        isEmpty: false,
      })
    })

    it("should handle empty cursor positions", () => {
      const selection = createSourceViewClaudeSelection({
        startLineNumber: 5,
        startLineStartOffset: 50,
        endLineNumber: 5,
        endLineStartOffset: 50,
        selectionFrom: 55,
        selectionTo: 55,
      })

      expect(selection).toEqual({
        start: { line: 4, character: 5 },
        end: { line: 4, character: 5 },
        isEmpty: true,
      })
    })

    it("should handle first line selection", () => {
      const selection = createSourceViewClaudeSelection({
        startLineNumber: 1,
        startLineStartOffset: 0,
        endLineNumber: 1,
        endLineStartOffset: 0,
        selectionFrom: 0,
        selectionTo: 10,
      })

      expect(selection).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
        isEmpty: false,
      })
    })

    it("should handle selection at very end of line", () => {
      // Line 3 starts at offset 20, line is 15 chars long
      const selection = createSourceViewClaudeSelection({
        startLineNumber: 3,
        startLineStartOffset: 20,
        endLineNumber: 3,
        endLineStartOffset: 20,
        selectionFrom: 30,
        selectionTo: 35,
      })

      expect(selection).toEqual({
        start: { line: 2, character: 10 },
        end: { line: 2, character: 15 },
        isEmpty: false,
      })
    })
  })

  /**
   * Integration tests using Lexical Headless Editor
   *
   * These tests verify the full flow from:
   * 1. Parsing markdown into Lexical editor state
   * 2. Creating a selection
   * 3. Extracting selected text via Lexical's getTextContent()
   * 4. Generating ClaudeSelection via createRichViewClaudeSelection()
   *
   * This is the exact same flow used in production (w.$workspaceId.f.$filePath.tsx)
   */
  describe("Lexical Rich View -> Claude Integration", () => {
    initializeUnitTest(
      (testEnv) => {
        /**
         * Helper that mimics production behavior:
         * Gets selected text and creates the ClaudeSelection that would be sent to Claude
         */
        const getSelectionForClaude = () => {
          let selectedText = ""
          let claudeSelection = createRichViewClaudeSelection("")

          testEnv.editor.getEditorState().read(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              selectedText = selection.getTextContent()
              claudeSelection = createRichViewClaudeSelection(selectedText)
            }
          })

          return { selectedText, claudeSelection }
        }

        it("should return empty selection for initial editor state", () => {
          const result = getSelectionForClaude()

          expect(result.selectedText).toBe("")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          })
        })

        it("should correctly extract single word selection from markdown", async () => {
          const content = "Hello spacecake"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const firstChild = root.getFirstChild()

                if ($isElementNode(firstChild)) {
                  const textNode = firstChild.getFirstChild()
                  if ($isTextNode(textNode)) {
                    // Select "spacecake" (offset 6 to 15)
                    textNode.select(6, 15)
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          expect(result.selectedText).toBe("spacecake")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 }, // "spacecake".length
            isEmpty: false,
          })
        })

        it("should handle collapsed cursor (empty selection)", async () => {
          const content = "Hello world"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const firstChild = root.getFirstChild()

                if ($isElementNode(firstChild)) {
                  const textNode = firstChild.getFirstChild()
                  if ($isTextNode(textNode)) {
                    // Collapsed selection at index 5 (cursor after "Hello")
                    textNode.select(5, 5)
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          expect(result.selectedText).toBe("")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          })
        })

        it("should handle multi-line selection from markdown with header", async () => {
          const content = "# Header\nLine 1\nLine 2"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const children = root.getChildren()
                // children[0] is HeadingNode (# Header)
                // children[1] is ParagraphNode containing "Line 1\nLine 2"

                const paragraph = children[1]

                if ($isElementNode(paragraph)) {
                  const paraChildren = paragraph.getChildren()
                  // paraChildren[0] is TextNode ("Line 1")
                  // paraChildren[1] is LineBreakNode
                  // paraChildren[2] is TextNode ("Line 2")
                  const text1 = paraChildren[0]
                  const text2 = paraChildren[2]

                  if ($isTextNode(text1) && $isTextNode(text2)) {
                    // Select from start of Line 1 to end of Line 2
                    const rangeSelection = $createRangeSelection()
                    rangeSelection.anchor.set(text1.getKey(), 0, "text")
                    rangeSelection.focus.set(text2.getKey(), 6, "text")
                    $setSelection(rangeSelection)
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          expect(result.selectedText).toBe("Line 1\nLine 2")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 }, // "Line 1\nLine 2".length
            isEmpty: false,
          })
        })

        it("should handle backward selection (anchor > focus)", async () => {
          const content = "# Header\nLine 1\nLine 2"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const children = root.getChildren()
                const paragraph = children[1]

                if ($isElementNode(paragraph)) {
                  const paraChildren = paragraph.getChildren()
                  const text1 = paraChildren[0]
                  const text2 = paraChildren[2]

                  if ($isTextNode(text1) && $isTextNode(text2)) {
                    // Create a backward selection (anchor at end, focus at start)
                    const rangeSelection = $createRangeSelection()
                    rangeSelection.anchor.set(text2.getKey(), 6, "text")
                    rangeSelection.focus.set(text1.getKey(), 0, "text")
                    $setSelection(rangeSelection)
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          // getTextContent() should still return the correct text
          expect(result.selectedText).toBe("Line 1\nLine 2")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
            isEmpty: false,
          })
        })

        it("should handle selection within a code block in markdown", async () => {
          // Note: Code blocks in rich view are handled by CodeMirror, but
          // let's verify plain inline code works correctly
          const content = "Some `inline code` here"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const firstChild = root.getFirstChild()

                if ($isElementNode(firstChild)) {
                  // Find the code node (likely second child after "Some ")
                  const children = firstChild.getChildren()
                  // Structure depends on transformers but typically:
                  // TextNode("Some "), CodeNode("inline code"), TextNode(" here")

                  // Select all text in the paragraph
                  if (children.length > 0) {
                    const firstText = children[0]
                    const lastText = children[children.length - 1]

                    if ($isTextNode(firstText) && $isTextNode(lastText)) {
                      const rangeSelection = $createRangeSelection()
                      rangeSelection.anchor.set(firstText.getKey(), 0, "text")
                      rangeSelection.focus.set(
                        lastText.getKey(),
                        lastText.getTextContentSize(),
                        "text"
                      )
                      $setSelection(rangeSelection)
                    }
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          // The inline code formatting may affect the text
          // but we should still get coherent output
          expect(result.selectedText.length).toBeGreaterThan(0)
          expect(result.claudeSelection.isEmpty).toBe(false)
        })

        it("should handle selecting header text", async () => {
          const content = "# My Header Title"

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const heading = root.getFirstChild()

                if ($isElementNode(heading)) {
                  const textNode = heading.getFirstChild()
                  if ($isTextNode(textNode)) {
                    // Select "Header" from "My Header Title"
                    textNode.select(3, 9)
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          expect(result.selectedText).toBe("Header")
          expect(result.claudeSelection).toEqual({
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
            isEmpty: false,
          })
        })

        it("should handle selecting entire document", async () => {
          const content = "# Title\n\nFirst paragraph.\n\nSecond paragraph."

          await act(async () => {
            testEnv.editor.update(
              () => {
                $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
              },
              { discrete: true }
            )
          })

          await act(async () => {
            testEnv.editor.update(
              () => {
                const root = $getRoot()
                const children = root.getChildren()

                if (children.length > 0) {
                  const firstElement = children[0]
                  const lastElement = children[children.length - 1]

                  if (
                    $isElementNode(firstElement) &&
                    $isElementNode(lastElement)
                  ) {
                    const firstText = firstElement.getFirstChild()
                    const lastText = lastElement.getLastChild()

                    if ($isTextNode(firstText) && $isTextNode(lastText)) {
                      const rangeSelection = $createRangeSelection()
                      rangeSelection.anchor.set(firstText.getKey(), 0, "text")
                      rangeSelection.focus.set(
                        lastText.getKey(),
                        lastText.getTextContentSize(),
                        "text"
                      )
                      $setSelection(rangeSelection)
                    }
                  }
                }
              },
              { discrete: true }
            )
          })

          const result = getSelectionForClaude()

          // Should contain text from all elements
          expect(result.selectedText).toContain("Title")
          expect(result.selectedText).toContain("First paragraph")
          expect(result.selectedText).toContain("Second paragraph")
          expect(result.claudeSelection.isEmpty).toBe(false)
        })
      },
      editorConfig,
      <Plugins />
    )
  })
})
