import {
  $isElementNode,
  $isRootOrShadowRoot,
  RangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical"

/**
 * Safely inserts a block node (DecoratorNode or ElementNode) at the current selection.
 *
 * This function handles the complexity of Lexical's node hierarchy requirements:
 * - Decorator nodes like CodeBlockNode cannot be directly inserted into ElementNodes (like ContainerNode)
 * - By finding the nearest block-level ancestor and using insertAfter,
 *   we ensure the node is placed at a valid location in the tree
 *
 * Strategy:
 * 1. Get the node at the selection anchor
 * 2. Walk up the tree to find a direct child of the root
 * 3. Insert the new node after that block element
 * 4. This ensures we're inserting at the block level, not nested inside containers
 */
export function insertBlockNode(
  node: LexicalNode,
  selection: RangeSelection
): void {
  let current: LexicalNode | null = selection.anchor.getNode()

  // walk up to find a direct child of the root
  while (current !== null) {
    const parent: ElementNode | null = current.getParent()
    if (parent !== null && $isRootOrShadowRoot(parent)) {
      // Insert after `current` (the direct child of root), not after the root itself
      current.insertAfter(node)
      return
    }
    current = parent
  }

  // fallback if we can't find a block-level parent
  const anchorNode = selection.anchor.getNode()
  if ($isElementNode(anchorNode)) {
    anchorNode.insertAfter(node)
  }
}
