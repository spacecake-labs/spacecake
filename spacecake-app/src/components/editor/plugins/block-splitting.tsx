import {
  $addUpdateTag,
  $createNodeSelection,
  $setSelection,
  LexicalEditor,
  LexicalNode,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"

import { delimitPyBlock } from "@/components/editor/block-utils"
import { CodeBlockNode } from "@/components/editor/nodes/code-node"
import { PyBlock } from "@/types/parser"

export async function maybeSplitBlock(
  editor: LexicalEditor,
  node: CodeBlockNode,
  blocks: PyBlock[],
  selectLastBlock = false,
) {
  let lastNode: LexicalNode | null = null

  if (blocks.length > 1) {
    editor.update(
      () => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        let currentNode: LexicalNode = node

        blocks.forEach((block, index) => {
          const newNode = delimitPyBlock(block, node.getSrc() ?? "")
          if (index === 0) {
            currentNode.replace(newNode)
          } else {
            currentNode.insertAfter(newNode)
          }

          currentNode = newNode
        })

        lastNode = currentNode
      },
      { discrete: true },
    )

    // apply selection to the last block if requested
    if (selectLastBlock && lastNode) {
      editor.update(
        () => {
          const selection = $createNodeSelection()
          selection.add(lastNode!.getKey())
          $setSelection(selection)
          ;(lastNode as unknown as { select: () => void }).select()
        },
        { discrete: true },
      )
    }
  }
}
