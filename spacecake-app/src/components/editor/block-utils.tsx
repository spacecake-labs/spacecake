import { $createCodeBlockNode } from "@/components/editor/nodes/code-node"
import { delimitedNode } from "@/components/editor/nodes/delimited-node"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import { PyBlock } from "@/types/parser"

/**
 * Pure function that converts a Python block into a delimited Lexical node
 */
export function delimitPyBlock(block: PyBlock, filePath: string) {
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
    delimitedString,
  )
}
