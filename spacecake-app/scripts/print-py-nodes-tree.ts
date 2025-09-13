import { readFile } from "node:fs/promises"
import { argv, exit } from "node:process"

import { Parser, type TreeCursor } from "web-tree-sitter"

import languages from "../src/lib/parser/languages"

function makeSnippet(
  text: string,
  from: number,
  to: number,
  maxLen: number = 80
): string {
  const slice = text.slice(from, to).replace(/\s+/g, " ").trim()
  if (slice.length <= maxLen) return slice
  return `${slice.slice(0, maxLen - 1)}…`
}

function printCursor(cursor: TreeCursor, text: string, indent: number): void {
  const pad = "  ".repeat(indent)
  const snippet = makeSnippet(text, cursor.startIndex, cursor.endIndex)
  // type [from,to] "snippet"
  console.log(
    `${pad}${cursor.nodeType} [${cursor.startIndex}, ${cursor.endIndex}] "${snippet}"`
  )
  if (cursor.gotoFirstChild()) {
    do {
      printCursor(cursor, text, indent + 1)
    } while (cursor.gotoNextSibling())
    cursor.gotoParent()
  }
}

async function main(): Promise<void> {
  const filePath = argv[2]
  if (!filePath) {
    console.error(
      "usage: pnpm tsx scripts/print-py-nodes-tree.ts <path-to-python-file>"
    )
    exit(1)
  }

  let source: string
  try {
    source = await readFile(filePath, "utf8")
  } catch (err) {
    console.error(`error reading file: ${String(err)}`)
    exit(1)
    return
  }

  const lang = await languages
  const parser = new Parser()
  parser.setLanguage(lang.Python)

  const tree = parser.parse(source)
  if (!tree) throw new Error("failed to parse code")
  const cursor = tree.walk()
  printCursor(cursor, source, 0)
}

void main()
