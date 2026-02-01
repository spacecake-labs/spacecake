import { $addUpdateTag, LexicalEditor, SKIP_DOM_SELECTION_TAG } from "lexical"

import { CodeBlockNode } from "@/components/editor/nodes/code-node"
import { PyBlock } from "@/types/parser"

export async function maybeUpdateDocstring(
  editor: LexicalEditor,
  node: CodeBlockNode,
  blocks: PyBlock[],
) {
  // if we have exactly one block and it has docstring info, update the node
  if (blocks.length === 1) {
    const block = blocks[0]
    const currentBlock = node.getBlock()

    // check if docstring info has changed
    const hasDocstringChanged =
      (block.doc && !currentBlock.doc) ||
      (!block.doc && currentBlock.doc) ||
      (block.doc &&
        currentBlock.doc &&
        (block.doc.text !== currentBlock.doc.text ||
          block.doc.startByte !== currentBlock.doc.startByte ||
          block.doc.endByte !== currentBlock.doc.endByte))

    if (hasDocstringChanged) {
      editor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        // update the block property with new docstring info
        node.setBlock(block)
      })
    }
  }
}
