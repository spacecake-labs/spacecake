import { addClassNamesToElement } from "@lexical/utils"
import {
  $applyNodeReplacement,
  ElementNode,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical"
import type { DOMConversionMap, DOMExportOutput, EditorConfig } from "lexical"

import type { Block } from "@/types/parser"

/**
 * The options necessary to construct a new context block node.
 */
export interface CreateContextNodeOptions {
  /**
   * The parsed block object containing doc content and metadata.
   */
  block: Block<"doc">
  /**
   * The source file path/name for the context block.
   */
  src: string
}

/**
 * A serialized representation of a ContextNode.
 */
export type SerializedContextNode = Spread<
  CreateContextNodeOptions & { type: "context"; version: 1 },
  SerializedElementNode
>

/**
 * A lexical node that represents a context block (docstring, markdown, etc.).
 * This is an element node that contains editable Lexical content.
 */
export class ContextNode extends ElementNode {
  __block: Block<"doc">
  __src: string

  static getType(): string {
    return "context"
  }

  static clone(node: ContextNode): ContextNode {
    return new ContextNode(node.__block, node.__src, node.__key)
  }

  static importJSON(serializedNode: SerializedContextNode): ContextNode {
    const { block, src } = serializedNode
    return $createContextNode({ block, src })
  }

  constructor(block: Block<"doc">, src: string, key?: NodeKey) {
    super(key)
    this.__block = block
    this.__src = src
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div")
    dom.className =
      "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 mt-2 context-block"

    // Create header with negative margins to counteract the padding
    const header = document.createElement("div")
    header.className =
      "flex items-center justify-between bg-muted/30 px-4 py-2 rounded-t-lg border-b border-border -mx-4 -mt-0"
    header.setAttribute("contenteditable", "false")
    header.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap" contenteditable="false">
        <span class="text-sm mr-2" contenteditable="false">📄</span>
        <h3 class="context-block-header-title font-semibold text-foreground text-sm leading-tight" contenteditable="false">${this.__block.name.value}</h3>
        <span class="inline-flex items-center rounded-md border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-mono text-secondary-foreground" contenteditable="false">${this.__block.kind}</span>
      </div>
    `

    // Append header first
    dom.appendChild(header)

    // Apply content styling to the main container
    // The Lexical content will be rendered as children of dom, after the header
    dom.style.paddingLeft = "1rem"
    dom.style.paddingRight = "1rem"
    dom.style.paddingBottom = "1rem"
    dom.style.paddingTop = "0"
    dom.style.backgroundColor = "hsl(var(--muted) / 0.1)"

    if (typeof config.theme.contextBlock === "string") {
      addClassNamesToElement(dom, config.theme.contextBlock)
    }

    return dom
  }

  updateDOM(prevNode: ContextNode): boolean {
    if (prevNode.__block !== this.__block || prevNode.__src !== this.__src) {
      // Recreate the DOM if block or src changed
      return true
    }
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("div")
    element.className = "context-block"
    element.setAttribute("data-lexical-context-block", "true")
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-context-block")) {
          return null
        }
        return {
          conversion: () => ({ node: null }),
          priority: 2,
        }
      },
    }
  }

  isShadowRoot(): boolean {
    return true
  }

  canBeEmpty(): boolean {
    return false
  }

  exportJSON(): SerializedContextNode {
    return {
      ...super.exportJSON(),
      block: this.getBlock(),
      src: this.getSrc(),
      type: "context",
      version: 1,
    }
  }

  getBlock(): Block<"doc"> {
    return this.__block
  }

  getSrc(): string {
    return this.__src
  }

  setBlock = (block: Block<"doc">) => {
    if (block !== this.__block) {
      this.getWritable().__block = block
    }
  }

  setSrc = (src: string) => {
    if (src !== this.__src) {
      this.getWritable().__src = src
    }
  }

  isInline(): boolean {
    return false
  }
}

/**
 * Creates a ContextNode.
 */
export function $createContextNode(
  options: CreateContextNodeOptions
): ContextNode {
  return $applyNodeReplacement(new ContextNode(options.block, options.src))
}

/**
 * Returns true if the given node is a ContextNode.
 */
export function $isContextNode(
  node: LexicalNode | null | undefined
): node is ContextNode {
  return node instanceof ContextNode
}
