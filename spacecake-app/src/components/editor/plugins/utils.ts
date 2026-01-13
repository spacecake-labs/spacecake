import { $isTableNode } from "@lexical/table"
import { $isDecoratorNode, $isRootOrShadowRoot, LexicalNode } from "lexical"

/**
 * Returns true if a spacer is needed after this node.
 * A spacer is needed if the node is a decorator or table, or if it's a shadow
 * root and its last child is a decorator or table.
 */
export function needsSpacer(node: LexicalNode): boolean {
  // add || $isContextNode(node) here if used in future
  if ($isDecoratorNode(node) || $isTableNode(node)) {
    return true
  }
  if ($isRootOrShadowRoot(node)) {
    const lastChild = node.getLastChild()
    return $isDecoratorNode(lastChild) || $isTableNode(lastChild)
  }
  return false
}
