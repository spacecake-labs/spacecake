/**
 * @vitest-environment jsdom
 */

import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { $getRoot } from "lexical"
import * as React from "react"
import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { $isMermaidNode } from "@/components/editor/nodes/mermaid-node"
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

describe("Mermaid node", () => {
  initializeUnitTest(
    (testEnv) => {
      afterEach(() => {
        vi.clearAllMocks()
      })

      it("should create a mermaid node when parsing markdown", async () => {
        const markdown = `
\`\`\`mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
\`\`\`
`
        await act(async () => {
          testEnv.editor.update(() => $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS), {
            discrete: true,
          })
        })

        testEnv.editor.getEditorState().read(() => {
          const root = $getRoot()
          const mermaidNode = root.getFirstChild()

          expect($isMermaidNode(mermaidNode)).toBe(true)
        })
      })
    },
    editorConfig,
    <Plugins />,
  )
})
