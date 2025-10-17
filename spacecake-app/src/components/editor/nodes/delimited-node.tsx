import { $getState, $setState, createState, LexicalNode } from "lexical"

import { DelimitedString, StringDelimiters } from "@/types/parser"

// TODO: use zod/something to parse properly
const delimitedState = createState("delimited", {
  parse: (v) => {
    if (v && typeof v === "object" && "prefix" in v && "suffix" in v) {
      return {
        prefix: String(v.prefix),
        suffix: String(v.suffix),
      }
    }
    return { prefix: "", suffix: "" }
  },
})

export const delimitedNode = <T extends LexicalNode>(
  nodeCreator: (content: string) => T,
  delimitedString: DelimitedString
): T => {
  const delimiters: StringDelimiters = {
    prefix: delimitedString.prefix,
    suffix: delimitedString.suffix,
  }

  const node = nodeCreator(delimitedString.between)

  $setState(node, delimitedState, delimiters)

  return node
}

export const $getDelimiters = (node: LexicalNode): StringDelimiters => {
  return $getState(node, delimitedState)
}

export const $getDelimitedString = (node: LexicalNode): string => {
  const delimiters = $getDelimiters(node)
  const content = node.getTextContent()
  return `${delimiters.prefix}${content}${delimiters.suffix}`
}
