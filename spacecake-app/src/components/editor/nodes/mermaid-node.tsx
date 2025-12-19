import type { JSX } from "react"
import * as React from "react"
import { useEffect } from "react"
import { indentWithTab } from "@codemirror/commands"
import { Compartment, EditorState, Extension } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { basicSetup } from "codemirror"
import { mermaid } from "codemirror-lang-mermaid"
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
} from "@/components/editor/nodes/code-node"
import MermaidDiagram from "@/components/editor/nodes/mermaid-diagram"
import { useTheme } from "@/components/theme-provider"

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

// Simple CodeMirror editor for mermaid without CodeBlock wrapper
interface MermaidCodeEditorProps {
  code: string
  nodeKey: NodeKey
  onCodeChange: (code: string) => void
}

const MermaidCodeEditor = React.forwardRef<
  HTMLDivElement,
  MermaidCodeEditorProps
>(({ code, onCodeChange }, _ref) => {
  const elRef = React.useRef<HTMLDivElement | null>(null)
  const editorViewRef = React.useRef<EditorView | null>(null)
  const { theme } = useTheme()
  const themeCompartment = React.useRef(new Compartment())

  useEffect(() => {
    if (!elRef.current) return
    const el = elRef.current

    const extensions: Extension[] = [
      basicSetup,
      mermaid(),
      lineNumbers(),
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      themeCompartment.current.of(theme === "dark" ? githubDark : githubLight),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onCodeChange(update.state.doc.toString())
        }
      }),
    ]

    el.innerHTML = ""
    editorViewRef.current = new EditorView({
      parent: el,
      state: EditorState.create({ doc: code, extensions }),
    })

    return () => {
      editorViewRef.current?.destroy()
      editorViewRef.current = null
    }
  }, [code, onCodeChange, theme])

  // Handle theme changes
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return

    const newTheme = theme === "dark" ? githubDark : githubLight
    view.dispatch({
      effects: themeCompartment.current.reconfigure(newTheme),
    })
  }, [theme])

  return <div ref={elRef} className="min-h-[200px]" />
})
MermaidCodeEditor.displayName = "MermaidCodeEditor"

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

    const handleToggleViewMode = () => {
      editor.update(() => {
        const node = this.getLatest()
        node.setViewMode(viewMode === "diagram" ? "code" : "diagram")
      })
    }

    const toggleButton = (
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
    )

    return (
      <React.Suspense fallback={<div />}>
        <div
          className={cn(
            "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          )}
        >
          <BlockHeader title="mermaid diagram" rightActions={toggleButton} />

          {/* Content area */}
          <div className="overflow-hidden rounded-b-lg">
            {viewMode === "code" ? (
              <CodeBlockEditorContext.Provider value={contextValue}>
                <MermaidCodeEditor
                  code={diagram}
                  nodeKey={nodeKey}
                  onCodeChange={(code) => {
                    contextValue.setCode(code)
                  }}
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
