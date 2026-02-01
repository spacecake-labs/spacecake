import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot } from "lexical"
import { useEffect } from "react"

import { $isFrontmatterNode, FrontmatterNode } from "@/components/editor/nodes/frontmatter-node"

/**
 * Plugin to enforce frontmatter constraints:
 * 1. Only one frontmatter node allowed per document
 * 2. Frontmatter must always be the first node
 */
export function FrontmatterPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Register node transform to enforce position
    return editor.registerNodeTransform(FrontmatterNode, (node) => {
      const root = $getRoot()
      const firstChild = root.getFirstChild()

      // If this frontmatter is not the first child, handle it
      if (firstChild !== node) {
        // Check if there's already a frontmatter at the start
        if ($isFrontmatterNode(firstChild)) {
          // Merge content: append new content to existing
          const existingYaml = firstChild.getYaml()
          const newYaml = node.getYaml()

          if (newYaml.trim()) {
            // Only merge if the new node has content
            const mergedYaml = existingYaml.trim() ? existingYaml + "\n" + newYaml : newYaml
            firstChild.setYaml(mergedYaml)
          }

          // Remove the duplicate node
          node.remove()
        } else {
          // Move this node to the start
          node.remove()
          if (firstChild) {
            firstChild.insertBefore(node)
          } else {
            root.append(node)
          }
        }
      }
    })
  }, [editor])

  return null
}
