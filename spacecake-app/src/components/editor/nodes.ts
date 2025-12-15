import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { HashtagNode } from "@lexical/hashtag"
import { AutoLinkNode, LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { OverflowNode } from "@lexical/overflow"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import {
  Klass,
  LexicalNode,
  LexicalNodeReplacement,
  ParagraphNode,
  TextNode,
} from "lexical"

import { CodeBlockNode } from "@/components/editor/nodes/code-node"
import { ContainerNode } from "@/components/editor/nodes/container-node"
import { ContextNode } from "@/components/editor/nodes/context-node"
import { ImageNode } from "@/components/editor/nodes/image-node"
import { InlineImageNode } from "@/components/editor/nodes/inline-image-node"
import { MermaidNode } from "@/components/editor/nodes/mermaid-node"

export const nodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement> =
  [
    HeadingNode,
    ParagraphNode,
    TextNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    LinkNode,
    OverflowNode,
    HashtagNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    CodeNode,
    CodeBlockNode,
    ContextNode,
    CodeHighlightNode,
    AutoLinkNode,
    ImageNode,
    InlineImageNode,
    ContainerNode,
    MermaidNode,
  ]
