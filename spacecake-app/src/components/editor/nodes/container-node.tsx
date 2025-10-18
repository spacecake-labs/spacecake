import { ElementNode, LexicalNode, SerializedElementNode } from "lexical"

/**
 * Simple container for other nodes.
 * isShadowRoot is set to true to allow for
 * top-level markdown shortcuts (element transformers).
 */
export class ContainerNode extends ElementNode {
  static getType(): string {
    return "container"
  }

  static clone(node: ContainerNode): ContainerNode {
    return new ContainerNode(node.__key)
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div")
    div.className = "container"
    return div
  }

  updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false
  }

  // make Lexical treat this node like a root for markdown shortcuts
  isShadowRoot(): boolean {
    return true
  }

  canContainText(): boolean {
    return false
  }

  canBeEmpty(): boolean {
    return true
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: "container",
      version: 1,
    }
  }

  static importJSON(serializedNode: SerializedElementNode): ContainerNode {
    // necessary to keep node state (delimiters)
    return $createContainerNode().updateFromJSON(serializedNode)
  }
}

export function $createContainerNode(): ContainerNode {
  return new ContainerNode()
}

export function $isContainerNode(
  node: LexicalNode | null | undefined
): node is ContainerNode {
  return node instanceof ContainerNode
}
