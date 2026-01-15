import type { JSX } from "react"
import * as React from "react"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import { mermaid } from "codemirror-lang-mermaid"
import {
  $addUpdateTag,
  $applyNodeReplacement,
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SKIP_DOM_SELECTION_TAG,
  Spread,
} from "lexical"
import { Code2, Eye } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BlockHeader } from "@/components/editor/block-header"
import {
  CodeBlockEditorContext,
  type CodeBlockEditorContextValue,
  type CodeMirrorFocusManager,
} from "@/components/editor/nodes/code-node"
import MermaidDiagram from "@/components/editor/nodes/mermaid-diagram"
import { BaseCodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor"

// WeakMap to store focus managers for mermaid block nodes
const focusManagerMap = new WeakMap<MermaidNode, CodeMirrorFocusManager>()

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

  createDOM(): HTMLElement {
    const div = document.createElement("div")
    // padding between blocks, consistent with CodeBlockNode
    div.className = "mt-2"
    return div
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getDiagram(): string {
    return this.__diagram
  }

  // This is called by Lexica's `$convertToMarkdownString` function
  getTextContent(): string {
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

  select = () => {
    // focus the CodeMirror editor directly
    const focusManager = focusManagerMap.get(this)
    focusManager?.focus()
  }

  setFocusManager = (focusManager: CodeMirrorFocusManager) => {
    focusManagerMap.set(this, focusManager)
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <MermaidNodeEditorContainer
        parentEditor={editor}
        mermaidNode={this}
        nodeKey={this.getKey()}
      />
    )
  }
}

interface MermaidNodeEditorContainerProps {
  parentEditor: LexicalEditor
  mermaidNode: MermaidNode
  nodeKey: NodeKey
}

interface MermaidEditorContextProviderProps {
  parentEditor: LexicalEditor
  nodeKey: NodeKey
  children: React.ReactNode
}

const MermaidEditorContextProvider: React.FC<
  MermaidEditorContextProviderProps
> = ({ parentEditor, nodeKey, children }) => {
  const contextValue = React.useMemo(() => {
    return {
      lexicalNode: null as never,
      parentEditor,
      src: "",
      setCode: (code: string) => {
        parentEditor.update(() => {
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
    } as CodeBlockEditorContextValue
  }, [parentEditor, nodeKey])

  return (
    <CodeBlockEditorContext.Provider value={contextValue}>
      {children}
    </CodeBlockEditorContext.Provider>
  )
}

const MermaidNodeEditorContainer: React.FC<MermaidNodeEditorContainerProps> = ({
  parentEditor,
  mermaidNode,
  nodeKey,
}) => {
  const [isNodeSelected, setNodeSelected, clearNodeSelection] =
    useLexicalNodeSelection(nodeKey)

  const viewMode = mermaidNode.__viewMode
  const diagram = mermaidNode.__diagram

  React.useEffect(() => {
    return mergeRegister(
      parentEditor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const mermaidElem = parentEditor.getElementByKey(nodeKey)

          if (mermaidElem && mermaidElem.contains(event.target as Node)) {
            if (!event.shiftKey) {
              clearNodeSelection()
            }
            setNodeSelected(!isNodeSelected)
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [clearNodeSelection, parentEditor, setNodeSelected, nodeKey])

  const handleCodeChange = React.useCallback(
    (code: string) => {
      parentEditor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const node = $getNodeByKey(nodeKey)
        if (node && $isMermaidNode(node)) {
          ;(node as MermaidNode).setDiagram(code)
        }
      })
    },
    [parentEditor, nodeKey]
  )

  const handleToggleViewMode = React.useCallback(() => {
    parentEditor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node && $isMermaidNode(node)) {
        node.setViewMode(viewMode === "diagram" ? "code" : "diagram")
      }
    })
  }, [parentEditor, nodeKey, viewMode])

  const handleDelete = React.useCallback(() => {
    parentEditor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const node = $getNodeByKey(nodeKey)
      if (node) {
        node.remove()
      }
    })
  }, [parentEditor, nodeKey])

  // memoize the mermaid language extension to avoid recreating it on every render
  const mermaidLanguageExtension = React.useMemo(() => mermaid(), [])

  const toggleButton = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleViewMode}
            className="h-6 w-6 p-0 cursor-pointer"
            data-testid="mermaid-toggle-view-mode"
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
  )

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
      data-testid="mermaid-node"
    >
      <BlockHeader
        title="anonymous"
        emoji="📊"
        badge="diagram"
        rightActions={toggleButton}
        onDelete={handleDelete}
      />

      {/* Content area */}
      <div
        className="overflow-hidden rounded-b-lg"
        data-testid="mermaid-node-content"
      >
        {viewMode === "code" ? (
          <MermaidEditorContextProvider
            parentEditor={parentEditor}
            nodeKey={nodeKey}
          >
            <div data-testid="mermaid-code-editor">
              <BaseCodeMirrorEditor
                language={mermaidLanguageExtension}
                code={diagram}
                nodeKey={nodeKey}
                onCodeChange={handleCodeChange}
                showLineNumbers={true}
                mermaidNode={mermaidNode}
              />
            </div>
          </MermaidEditorContextProvider>
        ) : (
          <MermaidDiagram diagram={diagram} nodeKey={nodeKey} />
        )}
      </div>
    </div>
  )
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
