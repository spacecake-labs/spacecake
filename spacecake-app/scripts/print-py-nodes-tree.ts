import { readFile } from "node:fs/promises"
import { argv, exit } from "node:process"
import Parser from "tree-sitter"

import { createParser } from "../src/lib/parser/languages"

const parser = createParser()

function makeSnippet(text: string, from: number, to: number, maxLen: number = 80): string {
  const slice = text.slice(from, to).replace(/\s+/g, " ").trim()
  if (slice.length <= maxLen) return slice
  return `${slice.slice(0, maxLen - 1)}…`
}

function printCursor(cursor: Parser.TreeCursor, text: string, indent: number): void {
  const pad = "  ".repeat(indent)
  const snippet = makeSnippet(text, cursor.startIndex, cursor.endIndex)
  // type [from,to] "snippet"
  console.log(`${pad}${cursor.nodeType} [${cursor.startIndex}, ${cursor.endIndex}] "${snippet}"`)
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
    console.error("usage: pnpm tsx scripts/print-py-nodes-tree.ts <path-to-python-file>")
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

  const tree = parser.parse(source)
  if (!tree) throw new Error("failed to parse code")
  try {
    const cursor = tree.walk()
    printCursor(cursor, source, 0)
  } finally {
    tree.delete()
  }
}

void main()
