import { Node } from "web-tree-sitter"

import { isDocstring } from "@/lib/parser/python/blocks"

/**
 * Find the docstring node within a given node (function, class, etc.)
 * Searches for a block child that contains a docstring
 */
export function findDocstringNode(node: Node): Node | null {
  for (const child of node.children) {
    if (child && child.type === "block") {
      const blockChild = child.firstChild
      if (blockChild && isDocstring(blockChild)) {
        return blockChild
      }
    }
  }
  return null
}

/**
 * Convert tabs to spaces following Python's rules (4 spaces per tab for this implementation)
 */
function expandTabs(text: string): string {
  return text.replace(/\t/g, "    ")
}

/**
 * Dedent a docstring according to Python's docstring processing rules.
 *
 * Rules:
 * - Strip uniform indentation from second and further lines equal to minimum indentation
 * - Remove any indentation from the first line
 * - Retain relative indentation of later lines
 * - Remove blank lines from beginning and end
 * - Convert tabs to spaces following Python rules
 */
export function dedentDocstring(docstring: string): string {
  if (!docstring) {
    return ""
  }

  // Handle empty docstrings (just quotes)
  const docstringTrimmed = docstring.trim()
  if (
    docstringTrimmed === '""""""' ||
    docstringTrimmed === "''''''" ||
    docstringTrimmed === '"""' ||
    docstringTrimmed === "'''"
  ) {
    return ""
  }

  // Convert tabs to spaces and split into lines
  const lines = expandTabs(docstring).split("\n")

  // Determine minimum indentation (first line doesn't count)
  let indent = Number.MAX_SAFE_INTEGER
  for (const line of lines.slice(1)) {
    const stripped = line.trimStart()
    if (stripped) {
      indent = Math.min(indent, line.length - stripped.length)
    }
  }

  // Remove indentation (first line is special)
  const trimmed = [lines[0].trim()]
  if (indent < Number.MAX_SAFE_INTEGER) {
    for (const line of lines.slice(1)) {
      trimmed.push(line.slice(indent).trimEnd())
    }
  }

  // Strip off trailing and leading blank lines
  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]) {
    trimmed.pop()
  }
  while (trimmed.length > 0 && !trimmed[0]) {
    trimmed.shift()
  }

  // Return a single string
  return trimmed.join("\n")
}
