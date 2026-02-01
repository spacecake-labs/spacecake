import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown"
import { ElementNode } from "lexical"

import { $createContainerNode } from "@/components/editor/nodes/container-node"
import { $getDelimiters, delimitedNode } from "@/components/editor/nodes/delimited-node"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import { addPythonMdocPrefixes, stripPythonMdocPrefixes } from "@/lib/parser/python/utils"

export function mdBlockToNode(text: string) {
  const delimitedString = delimitWithSpaceConsumer(text)

  // container node has isShadowRoot set so that
  // top-level markdown shortcuts (element transformers) still work
  const container = $createContainerNode()
  $convertFromMarkdownString(
    stripPythonMdocPrefixes(delimitedString.between),
    MARKDOWN_TRANSFORMERS,
    container,
    true,
  )
  return delimitedNode(() => container, delimitedString)
}

export function emptyMdNode() {
  // two newlines to separate the block from the previous block
  return mdBlockToNode("\n\n")
}

export function nodeToMdBlock(node: ElementNode) {
  const delimiters = $getDelimiters(node)
  const content = addPythonMdocPrefixes($convertToMarkdownString(MARKDOWN_TRANSFORMERS, node, true))
  return `${delimiters.prefix}${content}${delimiters.suffix}`
}

export const $getMarkdownDelimitedString = (node: ElementNode): string => {
  const delimiters = $getDelimiters(node)
  const content = $convertToMarkdownString(MARKDOWN_TRANSFORMERS, node, true)
  return `${delimiters.prefix}${content}${delimiters.suffix}`
}
