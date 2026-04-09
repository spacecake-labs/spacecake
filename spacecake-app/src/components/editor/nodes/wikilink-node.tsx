import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"
import { $applyNodeReplacement, DecoratorNode } from "lexical"
import type { JSX } from "react"
import * as React from "react"

const WikiLinkComponent = React.lazy(() => import("@/components/editor/wikilink-component"))

export interface WikiLinkPayload {
  target: string
  alias: string | null
  key?: NodeKey
}

export type SerializedWikiLinkNode = Spread<
  {
    target: string
    alias: string | null
  },
  SerializedLexicalNode
>

export class WikiLinkNode extends DecoratorNode<JSX.Element> {
  __target: string
  __alias: string | null

  static getType(): string {
    return "wikilink"
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(node.__target, node.__alias, node.__key)
  }

  static importJSON(serializedNode: SerializedWikiLinkNode): WikiLinkNode {
    return $createWikiLinkNode({
      target: serializedNode.target,
      alias: serializedNode.alias,
    })
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  constructor(target: string, alias: string | null, key?: NodeKey) {
    super(key)
    this.__target = target
    this.__alias = alias
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      target: this.__target,
      alias: this.__alias,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span")
    element.setAttribute("data-wikilink-target", this.__target)
    if (this.__alias) {
      element.setAttribute("data-wikilink-alias", this.__alias)
    }
    element.textContent = this.__alias ?? this.__target
    return { element }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span")
    const theme = config.theme.wikilink
    if (theme) {
      span.className = typeof theme === "string" ? theme : ""
    }
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return false
  }

  getTarget(): string {
    return this.__target
  }

  getAlias(): string | null {
    return this.__alias
  }

  getTextContent(): string {
    return this.__alias ?? this.__target
  }

  decorate(): JSX.Element {
    return <WikiLinkComponent target={this.__target} alias={this.__alias} nodeKey={this.getKey()} />
  }
}

export function $createWikiLinkNode({ target, alias, key }: WikiLinkPayload): WikiLinkNode {
  return $applyNodeReplacement(new WikiLinkNode(target, alias, key))
}

export function $isWikiLinkNode(node: LexicalNode | null | undefined): node is WikiLinkNode {
  return node instanceof WikiLinkNode
}
