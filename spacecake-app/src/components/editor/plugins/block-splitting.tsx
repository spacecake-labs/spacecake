import { $getNodeByKey, LexicalEditor, LexicalNode } from "lexical"

import { PyBlock } from "@/types/parser"
import { parseCodeBlocks } from "@/lib/parser/python/blocks"
import { delimitPyBlock } from "@/components/editor/block-utils"
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"

async function getBlocks(code: string): Promise<PyBlock[]> {
  const blocks: PyBlock[] = []
  for await (const block of parseCodeBlocks(code)) {
    blocks.push(block)
  }
  return blocks
}

export async function maybeSplitBlock(editor: LexicalEditor, nodeKey: string) {
  // get the blocks first, outside of editor.update
  const node = editor.getEditorState().read(() => $getNodeByKey(nodeKey))
  if (!$isCodeBlockNode(node)) {
    return
  }

  const blocks = await getBlocks(node.getCode())

  if (blocks.length > 1) {
    editor.update(() => {
      let currentNode: LexicalNode = node

      if (blocks.length > 1) {
        blocks.forEach((block, index) => {
          const newNode = delimitPyBlock(block, node.getSrc() ?? "")
          if (index === 0) {
            currentNode.replace(newNode)
          } else {
            currentNode.insertAfter(newNode)
          }
          currentNode = newNode
        })
      }
    })
  }
}
