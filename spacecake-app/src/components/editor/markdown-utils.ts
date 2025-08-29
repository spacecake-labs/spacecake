import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { Option } from "effect"
import { $createParagraphNode, ElementNode } from "lexical"

import type { MdBlockKind } from "@/types/parser"
import { Block } from "@/types/parser"
import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import { parseDirective } from "@/lib/parser/directives"
import { SPACE_CONSUMER_PATTERN } from "@/lib/parser/regex"
import {
  $getDelimiters,
  delimitedNode,
} from "@/components/editor/nodes/delimited"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export function stripPythonMdocPrefixes(text: string): string {
  return text.replace(/^#{3}\s?/gm, "")
}

export function addPythonMdocPrefixes(text: string): string {
  return `### ${text}`.replace(/\n/g, "\n### ")
}

export function mdBlockToNode(block: Block<MdBlockKind>) {
  const delimitedString = delimitWithSpaceConsumer(block.text)
  const container = $createParagraphNode()
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

export function delimitMdBlock(block: Block<MdBlockKind>) {
  const directive = Option.getOrNull(
    parseDirective(block.text, SPACE_CONSUMER_PATTERN)
  )

  if (!directive) {
    return null
  }

  const container = $createParagraphNode()

  $convertFromMarkdownString(
    directive.content.between,
    MARKDOWN_TRANSFORMERS,
    container
  )

  // Return the delimited node with the original text structure preserved
  return delimitedNode(() => container, directive.content)
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
