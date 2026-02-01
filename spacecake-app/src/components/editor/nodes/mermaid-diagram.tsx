import type { MermaidConfig } from "mermaid"

import { NodeKey } from "lexical"
import { ChevronDown } from "lucide-react"
import React, { useEffect, useState } from "react"

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
}

export default function MermaidDiagram({
  diagram,
  nodeKey,
}: MermaidDiagramProps): React.ReactElement {
  const { theme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string>("")

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

  if (error && !svgContent) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
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
      className="w-full overflow-auto rounded bg-gray-50 p-4 dark:bg-gray-900"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
