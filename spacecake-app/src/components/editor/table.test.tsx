/**
 * @vitest-environment jsdom
 */

import * as React from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { $isTableNode, $isTableRowNode } from "@lexical/table"
import { $getRoot } from "lexical"
import { describe, expect, it, vi } from "vitest"

import { serializeEditorToMarkdown } from "@/lib/editor"
import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { initializeUnitTest } from "@/components/editor/test-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

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
    <div className="relative">
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <div className="h-full flex flex-1 min-h-0">
              <div className="h-full flex-1 min-h-0">
                <ContentEditable
                  placeholder={""}
                  className="ContentEditable__root relative block h-full min-h-0 flex-1 overflow-auto px-8 py-4 focus:outline-none"
                />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />

        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
      </div>
    </div>
  )
})

describe("Table markdown transformer", () => {
  initializeUnitTest(
    (testEnv) => {
      it("should support tables with pipes on either end (GFM spec)", () => {
        // GFM spec: "The pipes on either end of the table are optional."
        const withPipes = `| Name | Value |
| --- | --- |
| Item | 100 |`

        const withoutPipes = `Name | Value
--- | ---
Item | 100`

        testEnv.editor.update(
          () =>
            $convertFromMarkdownString(
              withPipes,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            ),
          { discrete: true }
        )

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const table = root.getFirstChild()
          expect($isTableNode(table)).toBe(true)
        })

        // Reset editor
        testEnv.editor.update(() => {
          $getRoot().clear()
          $convertFromMarkdownString(
            withoutPipes,
            MARKDOWN_TRANSFORMERS,
            undefined,
            true
          )
        })

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const table = root.getFirstChild()
          // Both formats should parse to a table
          expect($isTableNode(table)).toBe(true)
        })
      })

      it("should support inline formatting in table cells (GFM spec)", () => {
        // GFM spec: "You can use formatting such as links, inline code blocks, and text styling"
        const text = `| Command | Description |
| --- | --- |
| \`git status\` | List all *new or modified* files |
| \`git diff\` | Show file differences that **haven't been** staged |`

        testEnv.editor.update(
          () =>
            $convertFromMarkdownString(
              text,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            ),
          { discrete: true }
        )

        const result = serializeEditorToMarkdown(
          testEnv.editor.getEditorState()
        )
        expect(result).toBe(text)
      })

      it("should support text alignment in headers (GFM spec)", () => {
        // GFM spec: "You can align text to the left, right, or center of a column by including colons"
        const text = `| Left-aligned | Center-aligned | Right-aligned |
| :--- | :---: | ---: |
| git status | git status | git status |
| git diff | git diff | git diff |`

        testEnv.editor.update(
          () =>
            $convertFromMarkdownString(
              text,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            ),
          { discrete: true }
        )

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const table = root.getFirstChild()

          expect($isTableNode(table)).toBe(true)

          if (!$isTableNode(table)) {
            throw new Error("Expected table node")
          }

          const rows = table.getChildren()
          expect(rows.length).toBe(3)
        })
      })

      it("should support empty cells in tables", () => {
        const text = `|  | Feature | Supported |
| --- | --- | --- |
|  | Tables | ✅ |
| ✓ | Task Lists | ✅ |`

        testEnv.editor.update(
          () =>
            $convertFromMarkdownString(
              text,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            ),
          { discrete: true }
        )

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const table = root.getFirstChild()

          expect($isTableNode(table)).toBe(true)

          if (!$isTableNode(table)) {
            throw new Error("Expected table node")
          }

          const rows = table.getChildren()
          expect(rows.length).toBe(3)

          // Verify all rows have consistent column count
          const headerRow = rows[0]
          if (!$isTableRowNode(headerRow)) {
            throw new Error("Expected header row")
          }

          const columnCount = headerRow.getChildrenSize()

          rows.forEach((row, idx) => {
            if (!$isTableRowNode(row)) {
              throw new Error(`Expected row at index ${idx}`)
            }
            expect(row.getChildrenSize()).toBe(columnCount)
          })
        })
      })

      it("should round-trip table conversion consistently", () => {
        const text = `| Fruit | Color | Taste |
| --- | --- | --- |
| Apple | Red | Sweet |
| Lemon | Yellow | Sour |`

        testEnv.editor.update(
          () =>
            $convertFromMarkdownString(
              text,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            ),
          { discrete: true }
        )

        const result = serializeEditorToMarkdown(
          testEnv.editor.getEditorState()
        )
        expect(result).toBe(text)

        // parse the result again and verify it matches (ensures deterministic output)
        testEnv.editor.update(
          () => {
            $getRoot().clear()
            $convertFromMarkdownString(
              result,
              MARKDOWN_TRANSFORMERS,
              undefined,
              true
            )
          },
          { discrete: true }
        )

        const secondResult = serializeEditorToMarkdown(
          testEnv.editor.getEditorState()
        )
        expect(secondResult).toBe(text)
      })
    },
    editorConfig,
    <Plugins />
  )
})
