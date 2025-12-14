import React, { useEffect, useRef } from "react"
import { NodeKey } from "lexical"
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

  useEffect(() => {
    if (!containerRef.current || !diagram.trim()) return

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
          if (!containerRef.current) return

          // preserve container height to prevent layout shift during re-render
          const currentHeight = containerRef.current.offsetHeight
          const hasContent = currentHeight > 0

          // clear previous content
          containerRef.current.innerHTML = ""

          // set minimum height to prevent container collapse
          if (hasContent) {
            containerRef.current.style.minHeight = `${currentHeight}px`
          }

          // create a unique id for this diagram
          const diagramId = `mermaid-${nodeKey}`

          // render the diagram using mermaid.render
          // this returns the SVG string directly without DOM manipulation
          const { svg } = await mermaid.render(diagramId, diagram)

          // insert the rendered SVG
          containerRef.current.innerHTML = svg

          // reset minHeight to allow natural sizing
          containerRef.current.style.minHeight = ""
        } catch (error) {
          // show error message if diagram is invalid
          if (!containerRef.current) return
          const errorMsg =
            error instanceof Error ? error.message : "unknown error"
          containerRef.current.innerHTML = `<div class="text-red-500 text-sm p-4 bg-red-50 rounded border border-red-200 dark:bg-red-950 dark:text-red-200">
            <strong>mermaid diagram error:</strong> ${errorMsg}
          </div>`
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

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-4 rounded bg-gray-50 p-4 dark:bg-gray-900 overflow-auto"
      data-testid={`mermaid-diagram-${nodeKey}`}
    />
  )
}
