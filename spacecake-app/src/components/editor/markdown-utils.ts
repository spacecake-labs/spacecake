import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { ElementNode } from "lexical"

import type { MdBlockKind } from "@/types/parser"
import { Block } from "@/types/parser"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import {
  addPythonMdocPrefixes,
  stripPythonMdocPrefixes,
} from "@/lib/parser/python/utils"
import { $createContainerNode } from "@/components/editor/nodes/container-node"
import {
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited-node"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export function mdBlockToNode(block: Block<MdBlockKind>) {
  const delimitedString = delimitWithSpaceConsumer(block.text)

  // container node has isShadowRoot set so that
  // top-level markdown shortcuts (element transformers) still work
  const container = $createContainerNode()
  $convertFromMarkdownString(
    stripPythonMdocPrefixes(block.text),
    MARKDOWN_TRANSFORMERS,
    container
  )
  return delimitedNode(() => container, delimitedString)
}

export function nodeToMdBlock(node: ElementNode) {
  const delimiters = $getDelimiters(node)
  const content = addPythonMdocPrefixes(
    $convertToMarkdownString(MARKDOWN_TRANSFORMERS, node, true)
  )
  return `${delimiters.prefix}${content}${delimiters.suffix}`
}

export const $getMarkdownDelimitedString = (node: ElementNode): string => {
  const delimiters = $getDelimiters(node)

  const content = $convertToMarkdownString(
    MARKDOWN_TRANSFORMERS,
    node,
    true
  ).replace(/\n/g, "\n# ")

  return `${delimiters.prefix}${content}${delimiters.suffix}`
}
