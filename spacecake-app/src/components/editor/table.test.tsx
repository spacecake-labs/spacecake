/**
 * @vitest-environment jsdom
 */

import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { $isTableNode, $isTableRowNode } from "@lexical/table"
import { $getRoot } from "lexical"
import * as React from "react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { initializeUnitTest } from "@/components/editor/test-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"
import { serializeEditorToMarkdown } from "@/lib/editor"

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
      it("should parse tables with pipes on either end (GFM spec)", async () => {
        // GFM spec: "The pipes on either end of the table are optional."
        const withPipes = `| Name | Value |
| --- | --- |
| Item | 100 |`

        await act(async () => {
          testEnv.editor.update(
            () => $convertFromMarkdownString(withPipes, MARKDOWN_TRANSFORMERS, undefined, true),
            { discrete: true },
          )
        })

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const table = root.getFirstChild()
          expect($isTableNode(table)).toBe(true)
        })
      })

      // TODO: Markdown transformer doesn't currently support tables without leading pipes
      it.todo("should parse tables without pipes on either end (GFM spec)")

      it("should support inline formatting in table cells (GFM spec)", async () => {
        // GFM spec: "You can use formatting such as links, inline code blocks, and text styling"
        const text = `| Command | Description |
| --- | --- |
| \`git status\` | List all *new or modified* files |
| \`git diff\` | Show file differences that **haven't been** staged |`

        await act(async () => {
          testEnv.editor.update(
            () => $convertFromMarkdownString(text, MARKDOWN_TRANSFORMERS, undefined, true),
            { discrete: true },
          )
        })

        const result = serializeEditorToMarkdown(testEnv.editor.getEditorState())
        expect(result).toBe(text)
      })

      it("should support text alignment in headers (GFM spec)", async () => {
        // GFM spec: "You can align text to the left, right, or center of a column by including colons"
        const text = `| Left-aligned | Center-aligned | Right-aligned |
| :--- | :---: | ---: |
| git status | git status | git status |
| git diff | git diff | git diff |`

        await act(async () => {
          testEnv.editor.update(
            () => $convertFromMarkdownString(text, MARKDOWN_TRANSFORMERS, undefined, true),
            { discrete: true },
          )
        })

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

      it("should support empty cells in tables", async () => {
        const text = `|  | Feature | Supported |
| --- | --- | --- |
|  | Tables | ✅ |
| ✓ | Task Lists | ✅ |`

        await act(async () => {
          testEnv.editor.update(
            () => $convertFromMarkdownString(text, MARKDOWN_TRANSFORMERS, undefined, true),
            { discrete: true },
          )
        })

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

      it("should round-trip table conversion consistently", async () => {
        const text = `| Fruit | Color | Taste |
| --- | --- | --- |
| Apple | Red | Sweet |
| Lemon | Yellow | Sour |`

        await act(async () => {
          testEnv.editor.update(
            () => $convertFromMarkdownString(text, MARKDOWN_TRANSFORMERS, undefined, true),
            { discrete: true },
          )
        })

        const result = serializeEditorToMarkdown(testEnv.editor.getEditorState())
        expect(result).toBe(text)

        // parse the result again and verify it matches (ensures deterministic output)
        await act(async () => {
          testEnv.editor.update(
            () => {
              $getRoot().clear()
              $convertFromMarkdownString(result, MARKDOWN_TRANSFORMERS, undefined, true)
            },
            { discrete: true },
          )
        })

        const secondResult = serializeEditorToMarkdown(testEnv.editor.getEditorState())
        expect(secondResult).toBe(text)
      })
    },
    editorConfig,
    <Plugins />,
  )
})
