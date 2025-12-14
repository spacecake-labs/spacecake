import React, { useEffect, useRef, useState } from "react"
import { NodeKey } from "lexical"
import { ChevronDown } from "lucide-react"
import mermaid from "mermaid"

import { useTheme } from "@/components/theme-provider"

interface MermaidDiagramProps {
  diagram: string
  nodeKey: NodeKey
}

export default function MermaidDiagram({
  diagram,
  nodeKey,
}: MermaidDiagramProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string>("")

  useEffect(() => {
    // always return cleanup function to follow React rules of hooks
    if (!containerRef.current || !diagram.trim()) {
      return () => {
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current)
        }
      }
    }

    // configure mermaid based on theme
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
    })

    // debounce rendering to avoid excessive re-renders during typing
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current)
    }

    renderTimeoutRef.current = setTimeout(() => {
      // render the diagram
      const renderDiagram = async () => {
        try {
          setError(null)

          if (!containerRef.current) return

          // create a unique id for this diagram
          const diagramId = `mermaid-${nodeKey}`

          // render the diagram using mermaid.render
          // this returns the SVG string directly without DOM manipulation
          const { svg } = await mermaid.render(diagramId, diagram)

          // store the svg content
          setSvgContent(svg)
        } catch (err) {
          // show error message if diagram is invalid
          const errorMsg = err instanceof Error ? err.message : "unknown error"
          setError(errorMsg)
          setSvgContent("")
        }
      }

      void renderDiagram()
    }, 300)

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current)
      }
    }
  }, [diagram, theme, nodeKey])

  // show error with collapsible diagram code
  if (error && !svgContent) {
    return (
      <div
        ref={containerRef}
        className="my-4 rounded border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
        data-testid={`mermaid-diagram-${nodeKey}`}
      >
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

  // render the SVG
  return (
    <div
      ref={containerRef}
      className="mermaid-container my-4 overflow-auto rounded bg-gray-50 p-4 dark:bg-gray-900"
      data-testid={`mermaid-diagram-${nodeKey}`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
