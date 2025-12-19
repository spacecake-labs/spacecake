import type { JSX } from "react"
import * as React from "react"
import {
  $addUpdateTag,
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SKIP_DOM_SELECTION_TAG,
  Spread,
} from "lexical"
import { Code2, Eye } from "lucide-react"

import { anonymousName } from "@/types/parser"
import type { Block } from "@/types/parser"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CodeBlockEditorContext,
  type CodeBlockEditorContextValue,
} from "@/components/editor/nodes/code-node"
import MermaidDiagram from "@/components/editor/nodes/mermaid-diagram"
import { CodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor"

export interface CreateMermaidNodeOptions {
  diagram: string
  key?: NodeKey
  viewMode?: "diagram" | "code"
}

export type SerializedMermaidNode = Spread<
  {
    diagram: string
    type: "mermaid"
    version: 1
    viewMode: "diagram" | "code"
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
  __viewMode: "diagram" | "code"

  static getType(): string {
    return "mermaid"
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__diagram, node.__key, node.__viewMode)
  }

  static importJSON(serializedNode: SerializedMermaidNode): MermaidNode {
    const { diagram, viewMode } = serializedNode
    return $createMermaidNode({ diagram, viewMode: viewMode ?? "diagram" })
  }

  static importDOM(): DOMConversionMap {
    return {
      div: () => ({
        conversion: $convertMermaidElement,
        priority: 0,
      }),
    }
  }

  constructor(
    diagram: string,
    key?: NodeKey,
    viewMode: "diagram" | "code" = "diagram"
  ) {
    super(key)
    this.__diagram = diagram
    this.__viewMode = viewMode
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      diagram: this.__diagram,
      type: "mermaid",
      version: 1,
      viewMode: this.__viewMode,
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

  getViewMode(): "diagram" | "code" {
    return this.__viewMode
  }

  setViewMode(viewMode: "diagram" | "code"): void {
    const writable = this.getWritable()
    writable.__viewMode = viewMode
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    const viewMode = this.__viewMode
    const diagram = this.__diagram

    const mockBlock: Block = {
      startByte: 0,
      endByte: diagram.length,
      startLine: 1,
      text: diagram,
      kind: "mermaid",
      name: anonymousName(),
    }

    const contextValue: CodeBlockEditorContextValue = {
      lexicalNode: null as never,
      parentEditor: editor,
      src: "",
      setCode: (code: string) => {
        editor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const node = $getNodeByKey(nodeKey)
          if (node && $isMermaidNode(node)) {
            ;(node as MermaidNode).setDiagram(code)
          }
        })
      },
      setLanguage: () => {
        // no-op for mermaid
      },
      setMeta: () => {
        // no-op for mermaid
      },
      setSrc: () => {
        // no-op for mermaid
      },
    }

    const dummyCodeBlockNode = {
      getKey: () => nodeKey,
      isSelected: () => false,
      setFocusManager: () => {
        // no-op
      },
    } as never

    const handleToggleViewMode = () => {
      editor.update(() => {
        const node = this.getLatest()
        node.setViewMode(viewMode === "diagram" ? "code" : "diagram")
      })
    }

    return (
      <React.Suspense fallback={<div />}>
        <div className="my-4 rounded border bg-card text-card-foreground shadow-sm">
          {/* Unified header */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 rounded-t-lg">
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              mermaid diagram
            </h3>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleViewMode}
                    className="h-7 w-7 p-0"
                  >
                    {viewMode === "diagram" ? (
                      <Code2 className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {viewMode === "diagram" ? "edit code" : "view diagram"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Content area */}
          <div className="overflow-hidden rounded-b-lg">
            {viewMode === "code" ? (
              <CodeBlockEditorContext.Provider value={contextValue}>
                <CodeMirrorEditor
                  language="mermaid"
                  nodeKey={nodeKey}
                  code={diagram}
                  block={mockBlock}
                  codeBlockNode={dummyCodeBlockNode}
                  enableLanguageSwitching={false}
                  showLineNumbers={true}
                />
              </CodeBlockEditorContext.Provider>
            ) : (
              <MermaidDiagram diagram={diagram} nodeKey={nodeKey} />
            )}
          </div>
        </div>
      </React.Suspense>
    )
  }
}

export function $createMermaidNode({
  diagram,
  key,
  viewMode = "diagram",
}: CreateMermaidNodeOptions): MermaidNode {
  return $applyNodeReplacement(new MermaidNode(diagram, key, viewMode))
}

export function $isMermaidNode(
  node: LexicalNode | null | undefined
): node is MermaidNode {
  return node instanceof MermaidNode
}
