/**
 * @vitest-environment jsdom
 */

import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import * as React from "react"
import { act } from "react"
import { describe, expect, it } from "vitest"

import { ContentEditable } from "@/components/editor/content-editable"
import { editorConfig } from "@/components/editor/editor"
import { mdBlockToNode, nodeToMdBlock } from "@/components/editor/markdown-utils"
import { initializeUnitTest } from "@/components/editor/test-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"
import { anonymousName, Block } from "@/types/parser"

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

describe("Python mdoc isomorphism", () => {
  initializeUnitTest(
    (testEnv) => {
      it("should maintain isomorphism through mdBlockToNode and nodeToMdBlock roundtrip", async () => {
        const text = `#🍰 # section with spaces
#🍰    this line has leading spaces
#🍰 
#🍰 ## subsection
#🍰 - item 1
#🍰 - item 2
#🍰 
#🍰 \`\`\`python
#🍰 def example():
#🍰     return "formatted"
#🍰 \`\`\`
#🍰 
#🍰 ## diagram
#🍰 
#🍰 \`\`\`mermaid
#🍰 graph LR
#🍰     A[Start] --> B{Decision}
#🍰     B -->|Yes| C[Process]
#🍰     B -->|No| D[End]
#🍰 \`\`\``

        const block: Block<"markdown block"> = {
          kind: "markdown block",
          text: text,
          startLine: 0,
          endByte: 0,
          startByte: 0,
          name: anonymousName(),
          cid: "",
          cidAlgo: "",
        }

        let result = ""

        await act(async () => {
          testEnv.editor.update(() => {
            const node = mdBlockToNode(block.text)
            result = nodeToMdBlock(node)
          })
        })

        expect(result).toBe(text)
      })
    },
    editorConfig,
    <Plugins />,
  )
})
