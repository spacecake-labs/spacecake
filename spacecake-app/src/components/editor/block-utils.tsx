import { $createHeadingNode } from "@lexical/rich-text"
import { $createParagraphNode, $createTextNode } from "lexical"

import { PyBlock } from "@/types/parser"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import { delimitPythonDocString } from "@/lib/parser/python/utils"
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node"
import { $createContextNode } from "@/components/editor/nodes/context-node"
import { delimitedNode } from "@/components/editor/nodes/delimited-node"

/**
 * Pure function that converts a Python block into a delimited Lexical node
 */
export function delimitPyBlock(block: PyBlock, filePath: string) {
  if (block?.doc) {
    const docBlock = block.doc
    const delimitedString = delimitPythonDocString(docBlock.text)
    return delimitedNode((text: string) => {
      const contextNode = $createContextNode({ block: docBlock, src: filePath })
      const [first, ...rest] = text.split("\n")
      const second = rest.join("\n")

      // First line becomes h2 header
      const heading = $createHeadingNode("h2")
      const headingText = $createTextNode(first)
      heading.append(headingText)
      contextNode.append(heading)

      // Second line becomes paragraph if it exists
      if (second) {
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode(second)
        paragraph.append(textNode)
        contextNode.append(paragraph)
      }

      return contextNode
    }, delimitedString)
  } else {
    const delimitedString = delimitWithSpaceConsumer(block.text)
    return delimitedNode(
      (text: string) =>
        $createCodeBlockNode({
          code: text,
          language: "python",
          meta: String(block.kind),
          src: filePath,
          block: block,
        }),
      delimitedString
    )
  }
}
