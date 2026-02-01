import type { JSX } from "react"

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect } from "react"

import { MermaidNode } from "@/components/editor/nodes/mermaid-node"

export function MermaidDiagramPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([MermaidNode])) {
      throw new Error("MermaidDiagramPlugin: MermaidNode not registered on editor")
    }
  }, [editor])

  return null
}
