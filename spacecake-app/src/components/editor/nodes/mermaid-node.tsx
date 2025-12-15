import type { JSX } from "react"
import * as React from "react"
import {
  $applyNodeReplacement,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"

import MermaidDiagram from "@/components/editor/nodes/mermaid-diagram"

export interface CreateMermaidNodeOptions {
  diagram: string
  key?: NodeKey
}

export type SerializedMermaidNode = Spread<
  {
    diagram: string
    type: "mermaid"
    version: 1
  },
  SerializedLexicalNode
>

function $convertMermaidElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const diagram = element.getAttribute("data-diagram")
  if (!diagram) {
    return null
  }
  const node = $createMermaidNode({ diagram })
  return { node }
}

export class MermaidNode extends DecoratorNode<JSX.Element> {
  __diagram: string

  static getType(): string {
    return "mermaid"
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__diagram, node.__key)
  }

  static importJSON(serializedNode: SerializedMermaidNode): MermaidNode {
    const { diagram } = serializedNode
    return $createMermaidNode({ diagram })
  }

  static importDOM(): DOMConversionMap {
    return {
      div: () => ({
        conversion: $convertMermaidElement,
        priority: 0,
      }),
    }
  }

  constructor(diagram: string, key?: NodeKey) {
    super(key)
    this.__diagram = diagram
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      diagram: this.__diagram,
      type: "mermaid",
      version: 1,
    }
  }

  exportDOM(): { element: HTMLElement } {
    const element = document.createElement("div")
    element.setAttribute("data-diagram", this.__diagram)
    element.className = "mermaid"
    return { element }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span")
    const theme = config.theme
    if (theme.mermaid !== undefined) {
      span.className = theme.mermaid
    }
    return span
  }

  updateDOM(): false {
    return false
  }

  getDiagram(): string {
    return this.__diagram
  }

  setDiagram(diagram: string): void {
    const writable = this.getWritable()
    writable.__diagram = diagram
  }

  decorate(): JSX.Element {
    return (
      <React.Suspense fallback={<div />}>
        <MermaidDiagram diagram={this.__diagram} nodeKey={this.getKey()} />
      </React.Suspense>
    )
  }
}

export function $createMermaidNode({
  diagram,
  key,
}: CreateMermaidNodeOptions): MermaidNode {
  return $applyNodeReplacement(new MermaidNode(diagram, key))
}

export function $isMermaidNode(
  node: LexicalNode | null | undefined
): node is MermaidNode {
  return node instanceof MermaidNode
}
