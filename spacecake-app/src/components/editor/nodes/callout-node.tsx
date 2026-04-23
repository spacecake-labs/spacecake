import {
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from "lexical"

import "@/components/editor/callout-styles.css"
import { getDefaultTitle, normalizeCalloutType, type CalloutType } from "@/lib/callout-types"

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType
    title: string
    foldable: boolean
    defaultOpen: boolean
  },
  SerializedElementNode
>

// block container for obsidian-style callouts: `> [!type] title` blockquotes.
// renders as a styled box with an icon header; the body is editable lexical children.
// fold state (data-fold attribute) is session-only, not persisted — matches obsidian.
export class CalloutNode extends ElementNode {
  __calloutType: CalloutType
  __title: string
  __foldable: boolean
  __defaultOpen: boolean

  constructor(
    calloutType: CalloutType = "note",
    title: string = "",
    foldable: boolean = false,
    defaultOpen: boolean = true,
    key?: NodeKey,
  ) {
    super(key)
    this.__calloutType = calloutType
    this.__title = title
    this.__foldable = foldable
    this.__defaultOpen = defaultOpen
  }

  static getType(): string {
    return "callout"
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(
      node.__calloutType,
      node.__title,
      node.__foldable,
      node.__defaultOpen,
      node.__key,
    )
  }

  createDOM(config: EditorConfig): HTMLElement {
    const wrapper = document.createElement("div")
    const themeClass = (config.theme as { callout?: string }).callout
    if (themeClass) wrapper.className = themeClass
    wrapper.setAttribute("data-callout", this.__calloutType)
    if (this.__foldable) {
      wrapper.setAttribute("data-fold", this.__defaultOpen ? "open" : "closed")
    }

    const header = document.createElement("div")
    header.className = "callout-header"
    header.contentEditable = "false"

    const icon = document.createElement("span")
    icon.className = "callout-icon"
    header.appendChild(icon)

    const titleEl = document.createElement("span")
    titleEl.className = "callout-title"
    titleEl.textContent = this.__title || getDefaultTitle(this.__calloutType)
    header.appendChild(titleEl)

    if (this.__foldable) {
      const chevron = document.createElement("span")
      chevron.className = "callout-fold-chevron"
      header.appendChild(chevron)
      header.addEventListener("click", () => {
        const current = wrapper.getAttribute("data-fold")
        wrapper.setAttribute("data-fold", current === "closed" ? "open" : "closed")
      })
    }

    wrapper.appendChild(header)
    return wrapper
  }

  updateDOM(prevNode: CalloutNode): boolean {
    // rebuild DOM when any header-affecting field changes; preserves lexical children
    return (
      prevNode.__calloutType !== this.__calloutType ||
      prevNode.__title !== this.__title ||
      prevNode.__foldable !== this.__foldable ||
      prevNode.__defaultOpen !== this.__defaultOpen
    )
  }

  // lets markdown element transformers fire inside the body
  isShadowRoot(): boolean {
    return true
  }

  canContainText(): boolean {
    return false
  }

  canBeEmpty(): boolean {
    return true
  }

  getCalloutType(): CalloutType {
    return this.getLatest().__calloutType
  }

  setCalloutType(type: CalloutType): this {
    const writable = this.getWritable()
    writable.__calloutType = type
    return writable
  }

  getTitle(): string {
    return this.getLatest().__title
  }

  setTitle(title: string): this {
    const writable = this.getWritable()
    writable.__title = title
    return writable
  }

  getFoldable(): boolean {
    return this.getLatest().__foldable
  }

  getDefaultOpen(): boolean {
    return this.getLatest().__defaultOpen
  }

  exportJSON(): SerializedCalloutNode {
    return {
      ...super.exportJSON(),
      type: "callout",
      version: 1,
      calloutType: this.__calloutType,
      title: this.__title,
      foldable: this.__foldable,
      defaultOpen: this.__defaultOpen,
    }
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode({
      type: normalizeCalloutType(serializedNode.calloutType),
      title: serializedNode.title,
      foldable: serializedNode.foldable,
      defaultOpen: serializedNode.defaultOpen,
    }).updateFromJSON(serializedNode)
  }
}

export function $createCalloutNode(options: {
  type?: CalloutType
  title?: string
  foldable?: boolean
  defaultOpen?: boolean
}): CalloutNode {
  return new CalloutNode(
    options.type ?? "note",
    options.title ?? "",
    options.foldable ?? false,
    options.defaultOpen ?? true,
  )
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode
}
