/**
 * @vitest-environment jsdom
 */

import * as React from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
} from "lexical"
import { describe, expect, it, vi } from "vitest"

import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { initializeUnitTest } from "@/components/editor/test-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

import {
  createClaudeSelectionPayload,
  getSelectedTextFromLexical,
} from "./selection-utils"

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
  initializeUnitTest(
    (testEnv) => {
      describe("getSelectedTextFromLexical", () => {
        it("should return empty string for initial editor state", () => {
          const text = getSelectedTextFromLexical(
            testEnv.editor.getEditorState()
          )
          expect(text).toBe("")
        })

        it("should return selected text when range is selected in markdown", () => {
          const content = "Hello spacecake"

          testEnv.editor.update(
            () => {
              $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
            },
            { discrete: true }
          )

          testEnv.editor.update(
            () => {
              const root = $getRoot()
              const firstChild = root.getFirstChild()

              if ($isElementNode(firstChild)) {
                // In markdown conversion, this is usually a ParagraphNode containing a TextNode
                const textNode = firstChild.getFirstChild()

                if ($isTextNode(textNode)) {
                  // Select "spacecake" (offset 6 to 15)
                  textNode.select(6, 15)
                }
              }
            },
            { discrete: true }
          )

          const editorState = testEnv.editor.getEditorState()
          const text = getSelectedTextFromLexical(editorState)

          expect(text).toBe("spacecake")
        })

        it("should return empty string when selection is collapsed", () => {
          const content = "Hello world"

          testEnv.editor.update(
            () => {
              $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
            },
            { discrete: true }
          )

          testEnv.editor.update(
            () => {
              const root = $getRoot()
              const firstChild = root.getFirstChild()

              if ($isElementNode(firstChild)) {
                const textNode = firstChild.getFirstChild()

                if ($isTextNode(textNode)) {
                  // Collapsed selection at index 5
                  textNode.select(5, 5)
                }
              }
            },
            { discrete: true }
          )

          const editorState = testEnv.editor.getEditorState()
          const text = getSelectedTextFromLexical(editorState)

          expect(text).toBe("")
        })

        it("should return selected text when range goes backwards (anchor > focus) across multiple lines", () => {
          const content = "# Header\nLine 1\nLine 2"

          testEnv.editor.update(
            () => {
              $convertFromMarkdownString(content, MARKDOWN_TRANSFORMERS)
            },
            { discrete: true }
          )

          testEnv.editor.update(
            () => {
              const root = $getRoot()
              const children = root.getChildren()
              // children[0] is HeadingNode (# Header)
              // children[1] is ParagraphNode (Line 1\nLine 2)

              const paragraph = children[1]

              if ($isElementNode(paragraph)) {
                const paraChildren = paragraph.getChildren()
                // paraChildren[0] is TextNode ("Line 1")
                // paraChildren[1] is LineBreakNode
                // paraChildren[2] is TextNode ("Line 2")
                const text1 = paraChildren[0]
                const text2 = paraChildren[2]

                if ($isTextNode(text1) && $isTextNode(text2)) {
                  // Create a backward selection:
                  // Anchor: End of Line 2
                  // Focus: Start of Line 1
                  const rangeSelection = $createRangeSelection()
                  rangeSelection.anchor.set(text2.getKey(), 6, "text")
                  rangeSelection.focus.set(text1.getKey(), 0, "text")
                  $setSelection(rangeSelection)
                }
              }
            },
            { discrete: true }
          )

          const editorState = testEnv.editor.getEditorState()
          const text = getSelectedTextFromLexical(editorState)

          expect(text).toBe("Line 1\nLine 2")
        })
      })
    },
    editorConfig,
    <Plugins />
  )

  describe("createClaudeSelectionPayload", () => {
    const filePath = "/path/to/file.ts"

    it("should create correct payload for rich view (default)", () => {
      const selectedText = "hello world"
      const payload = createClaudeSelectionPayload({
        filePath,
        selectedText,
        isEmpty: false,
      })

      expect(payload).toEqual({
        text: selectedText,
        filePath,
        fileUrl: `file://${filePath}`,
        selection: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: selectedText.length },
          isEmpty: false,
        },
      })
    })

    it("should create correct payload for source view with selection info", () => {
      const selectedText = "function test() {}"
      const selectionInfo = {
        startLine: 10,
        startChar: 4,
        endLine: 10,
        endChar: 22,
      }

      const payload = createClaudeSelectionPayload({
        filePath,
        viewKind: "source",
        selectedText,
        isEmpty: false,
        selectionInfo,
      })

      expect(payload).toEqual({
        text: selectedText,
        filePath,
        fileUrl: `file://${filePath}`,
        selection: {
          start: { line: 10, character: 4 },
          end: { line: 10, character: 22 },
          isEmpty: false,
        },
      })
    })

    it("should handle empty selection", () => {
      const payload = createClaudeSelectionPayload({
        filePath,
        selectedText: "",
        isEmpty: true,
      })

      expect(payload).toEqual({
        text: "",
        filePath,
        fileUrl: `file://${filePath}`,
        selection: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
          isEmpty: true,
        },
      })
    })
  })
})
