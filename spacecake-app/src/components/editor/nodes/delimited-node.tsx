import { Option, Schema } from "effect"
import { $getState, $setState, createState, LexicalNode } from "lexical"

import {
  DelimitedString,
  StringDelimiters,
  StringDelimitersSchema,
} from "@/types/parser"

const delimitedState = createState("delimited", {
  parse: (v: unknown) =>
    Option.getOrElse(
      Schema.decodeUnknownOption(StringDelimitersSchema)(v),
      (): StringDelimiters => ({
        prefix: "",
        suffix: "",
      })
    ),
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
