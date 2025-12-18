import { $getNodeByKey, LexicalEditor } from "lexical"

import { PyBlock } from "@/types/parser"
import { parseCodeBlocks } from "@/lib/parser/python/blocks"
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"

import { maybeSplitBlock } from "./block-splitting"
import { maybeUpdateDocstring } from "./docstring-update"

/**
 * Parse code into blocks - shared utility to avoid duplicate parsing
 */
export async function getBlocks(code: string): Promise<PyBlock[]> {
  const blocks: PyBlock[] = []
  for await (const block of parseCodeBlocks(code)) {
    blocks.push(block)
  }
  return blocks
}

/**
 * Combined function that handles both block splitting and docstring updates
 * Parses blocks once and passes them to both functions for efficiency
 */
export async function maybeUpdateBlockAndDocstring(
  editor: LexicalEditor,
  nodeKey: string,
  selectLastBlockOnSplit = false
) {
  // get the node first, outside of editor.update
  const node = editor.getEditorState().read(() => $getNodeByKey(nodeKey))
  if (!$isCodeBlockNode(node)) {
    return
  }

  // parse blocks once
  const blocks = await getBlocks(node.getCode())

  // call both functions with the same parsed blocks
  await Promise.all([
    maybeSplitBlock(editor, node, blocks, selectLastBlockOnSplit),
    maybeUpdateDocstring(editor, node, blocks),
  ])
}
