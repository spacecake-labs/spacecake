import { $isDecoratorNode, $isRootOrShadowRoot, LexicalNode } from "lexical"

/**
 * Returns true if a spacer is needed after this node.
 * A spacer is needed if the node is a decorator, or if it's a shadow root and
 * its last child is a decorator.
 */
export function needsSpacer(node: LexicalNode): boolean {
  // add || $isContextNode(node) here if used in future
  if ($isDecoratorNode(node)) {
    return true
  }
  if ($isRootOrShadowRoot(node)) {
    return $isDecoratorNode(node.getLastChild())
  }
  return false
}
