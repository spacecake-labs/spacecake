import { $createHeadingNode } from "@lexical/rich-text"
import { $createTextNode } from "lexical"

import type { PyBlock } from "@/types/parser"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import { delimitPythonDocString } from "@/lib/parser/python/utils"
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node"
import { delimitedNode } from "@/components/editor/nodes/delimited"

/**
 * Pure function that converts a Python block into a delimited Lexical node
 */
export function delimitPyBlock(block: PyBlock, filePath: string) {
  if (block.kind === "doc") {
    const delimitedString = delimitPythonDocString(block.text)
    return delimitedNode(
      (text: string) => $createHeadingNode("h2").append($createTextNode(text)),
      delimitedString
    )
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
