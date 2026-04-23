import { $isHeadingNode } from "@lexical/rich-text"
import { $getRoot, type LexicalEditor } from "lexical"

/**
 * normalize a heading text to an anchor slug.
 * - lowercase
 * - replace spaces with hyphens
 * - strip characters that are not alphanumeric, hyphens, or underscores
 * - collapse consecutive hyphens
 */
export function normalizeAnchor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * find the DOM element for a heading that matches the given anchor value.
 * traverses all root children, checks HeadingNodes, and compares
 * normalized text content against the normalized anchor. first match wins.
 */
export function findHeadingElement(editor: LexicalEditor, anchor: string): HTMLElement | null {
  const normalizedAnchor = normalizeAnchor(anchor)
  let matchedElement: HTMLElement | null = null

  editor.read(() => {
    const root = $getRoot()
    const children = root.getChildren()

    for (const child of children) {
      if ($isHeadingNode(child)) {
        const headingText = child.getTextContent()
        if (normalizeAnchor(headingText) === normalizedAnchor) {
          matchedElement = editor.getElementByKey(child.getKey())
          break
        }
      }
    }
  })

  return matchedElement
}

/**
 * find the DOM element for a block reference (paragraph ending with `^block-id`).
 * traverses all root children and checks text content for the block id suffix.
 */
export function findBlockElement(editor: LexicalEditor, blockId: string): HTMLElement | null {
  const suffix = `^${blockId}`
  let matchedElement: HTMLElement | null = null

  editor.read(() => {
    const root = $getRoot()
    const children = root.getChildren()

    for (const child of children) {
      const text = child.getTextContent()
      if (text.trimEnd().endsWith(suffix)) {
        matchedElement = editor.getElementByKey(child.getKey())
        break
      }
    }
  })

  return matchedElement
}

/**
 * scroll an element into the center of the viewport.
 */
export function scrollToHeading(element: HTMLElement): void {
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
}

/**
 * apply a brief highlight flash to the element. self-cleaning — the class
 * is removed after animation completes.
 */
export function flashElement(element: HTMLElement): void {
  element.classList.add("anchor-flash")
  element.addEventListener("animationend", () => element.classList.remove("anchor-flash"), {
    once: true,
  })
}
