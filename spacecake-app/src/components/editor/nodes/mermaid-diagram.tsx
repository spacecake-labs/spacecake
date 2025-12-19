import React, { useEffect, useMemo, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $addUpdateTag,
  $getNodeByKey,
  NodeKey,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"
import { ChevronDown, Code2, Eye } from "lucide-react"
import type { MermaidConfig } from "mermaid"

import type { Block } from "@/types/parser"
import { anonymousName } from "@/types/parser"
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
import {
  $isMermaidNode,
  type MermaidNode,
} from "@/components/editor/nodes/mermaid-node"
import { CodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor"
import { useTheme } from "@/components/theme-provider"

const initializeMermaid = async (customConfig?: MermaidConfig) => {
  const defaultConfig: MermaidConfig = {
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
    fontFamily: "monospace",
    suppressErrorRendering: true,
  } as MermaidConfig

  const config = { ...defaultConfig, ...customConfig }

  const mermaidModule = await import("mermaid")
  const mermaid = mermaidModule.default

  mermaid.initialize(config)

  return mermaid
}

interface MermaidDiagramProps {
  diagram: string
  nodeKey: NodeKey
  viewMode: "diagram" | "code"
  onViewModeChange: (mode: "diagram" | "code") => void
}

export default function MermaidDiagram({
  diagram,
  nodeKey,
  viewMode,
  onViewModeChange,
}: MermaidDiagramProps): React.ReactElement {
  const { theme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string>("")
  const [editor] = useLexicalComposerContext()

  // create a minimal block object for CodeMirrorEditor
  const mockBlock: Block = {
    startByte: 0,
    endByte: diagram.length,
    startLine: 1,
    text: diagram,
    kind: "mermaid",
    name: anonymousName(),
  }

  // Create context for the CodeMirrorEditor to update the mermaid diagram
  const contextValue = useMemo<CodeBlockEditorContextValue>(
    () => ({
      lexicalNode: null as never, // dummy value, not used for mermaid
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
    }),
    [editor, nodeKey]
  )

  // Create a dummy code block node for CodeMirrorEditor
  // This is only used for focus management, not for storing actual data
  const dummyCodeBlockNode = {
    getKey: () => nodeKey,
    isSelected: () => false,
    setFocusManager: () => {
      // no-op
    },
  } as never

  useEffect(() => {
    if (!diagram.trim()) {
      return
    }

    const renderDiagram = async () => {
      try {
        setError(null)

        const mermaid = await initializeMermaid({
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "strict",
        })

        const diagramId = `mermaid-${nodeKey}`
        const { svg } = await mermaid.render(diagramId, diagram)

        setSvgContent(svg)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "unknown error"
        setError(errorMsg)
        setSvgContent("")
      }
    }

    void renderDiagram()
  }, [diagram, theme, nodeKey])

  const renderDiagramMode = () => {
    if (error && !svgContent) {
      return (
        <div className="my-4 rounded border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            mermaid diagram error: {error}
          </p>
          <details className="mt-3">
            <summary className="flex cursor-pointer items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <ChevronDown className="h-3 w-3" />
              show diagram code
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-red-100 p-3 text-xs text-red-900 dark:bg-red-900 dark:text-red-100">
              {diagram}
            </pre>
          </details>
        </div>
      )
    }

    return (
      <div
        className="mermaid-container overflow-auto rounded bg-gray-50 p-4 dark:bg-gray-900"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    )
  }

  const renderCodeMode = () => {
    return (
      <div className="relative">
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
      </div>
    )
  }

  return (
    <div
      className="my-4 rounded border bg-card text-card-foreground shadow-sm"
      data-testid={`mermaid-diagram-${nodeKey}`}
    >
      {/* Header with toggle button */}
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
                onClick={() => {
                  onViewModeChange(viewMode === "diagram" ? "code" : "diagram")
                }}
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
        {viewMode === "code" ? renderCodeMode() : renderDiagramMode()}
      </div>
    </div>
  )
}
