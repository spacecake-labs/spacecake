import type Parser from "tree-sitter"

import type { EditorFile } from "@/types/workspace"

import { fnv1a64Hex } from "@/lib/hash"
import { type SyntaxNode, createParser } from "@/lib/parser/languages"
import { dedentDocstring, findDocstringNode } from "@/lib/parser/python/docstring"
import { filename } from "@/lib/utils"
import {
  anonymousName,
  BlockName,
  isDocablePyKind,
  namedBlock,
  PyBlock,
  PyDecoratedKind,
} from "@/types/parser"

let _parser: Parser | null = null

function getParser(): Parser {
  if (_parser) return _parser
  _parser = createParser()
  return _parser
}

export function isDataclass(node: SyntaxNode): boolean {
  if (node.type !== "decorated_definition") return false

  const hasDataclassName = (decoratorNode: SyntaxNode): boolean => {
    let found = false
    function walk(n: SyntaxNode) {
      if (n.type === "identifier" && n.text === "dataclass") {
        found = true
      }
      if (found) return
      for (const child of n.children) {
        if (!child) continue
        walk(child)
      }
    }
    walk(decoratorNode)
    return found
  }

  for (const child of node.children) {
    if (child?.type === "decorator") {
      if (hasDataclassName(child)) {
        return true
      }
    }
  }
  return false
}

export function isDocstring(node: SyntaxNode): boolean {
  if (node.type !== "expression_statement") return false

  // must be a string literal
  const stringNode = node.namedChild(0)
  if (!stringNode || stringNode.type !== "string" || node.namedChild(1)) {
    return false
  }

  // Check for triple quotes using child nodes
  const firstChild = stringNode.firstChild
  const lastChild = stringNode.lastChild

  if (!firstChild || !lastChild) return false

  // Check if it's a triple-quoted string (supports both single-line and multi-line)
  const isTripleQuoted =
    firstChild.type === "string_start" &&
    lastChild.type === "string_end" &&
    (firstChild.text === '"""' ||
      firstChild.text === 'r"""' ||
      firstChild.text === "'''" ||
      firstChild.text === "r'''")

  if (!isTripleQuoted) {
    return false
  }

  // check if it's the first statement in the parent body
  const parent = node.parent
  if (!parent) return false

  if (parent.type === "block" || parent.type === "module") {
    // 'block' is for function/class bodies
    // 'module' is for top-level
    for (const child of parent.children) {
      if (child?.type === "comment") continue
      // first non-comment child must be our node
      return child?.id === node.id
    }
  }

  return false
}

export function isMdocString(node: SyntaxNode): boolean {
  if (node.type !== "comment") return false
  return node.text.startsWith("#🍰")
}

export function blockKind(node: SyntaxNode): PyBlock["kind"] | null {
  switch (node.type) {
    case "class_definition":
      return "class"
    case "function_definition":
      return "function"
    case "import_statement":
      return "import"
    case "import_from_statement":
      return "import"
    case "decorated_definition": {
      const definition = node.lastNamedChild
      if (!definition) return null

      const childKind = blockKind(definition)
      if (!childKind) return null
      if (childKind === "class" && isDataclass(node)) {
        return "dataclass"
      }
      return `decorated ${childKind}` as PyDecoratedKind
    }
    case "if_statement": {
      const conditionNode = node.childForFieldName("condition")
      if (!conditionNode) return null
      const conditionText = conditionNode.text
      if (/^__name__\s*==\s*(['"])__main__\1$/.test(conditionText)) {
        return "main"
      }
      return null
    }
    case "comment": {
      return isMdocString(node) ? "markdown block" : null
    }
    default:
      return null
  }
}

export function blockName(node: SyntaxNode): BlockName {
  switch (node.type) {
    case "class_definition": {
      const nameNode = node.childForFieldName("name")
      return nameNode ? namedBlock(nameNode.text) : anonymousName()
    }
    case "function_definition": {
      const nameNode = node.childForFieldName("name")
      return nameNode ? namedBlock(nameNode.text) : anonymousName()
    }
    case "import_statement":
    case "import_from_statement": {
      return anonymousName()
    }
    case "decorated_definition": {
      const definition = node.lastNamedChild
      if (definition) {
        return blockName(definition)
      }
      return namedBlock("decorated")
    }
    default:
      return anonymousName()
  }
}

export function parseCodeBlocks(code: string, filePath?: string): PyBlock[] {
  const parser = getParser()
  const tree = parser.parse(code)
  if (!tree) throw new Error("failed to parse code")

  const blocks: PyBlock[] = []

  let importNodes: SyntaxNode[] = []
  let miscNodes: SyntaxNode[] = []
  let commentNodes: SyntaxNode[] = []
  let mdNodes: SyntaxNode[] = []
  let prevBlockEndByte = 0

  // pre-compute newline offsets once to avoid O(blocks * fileSize) substring allocations
  const newlineOffsets: number[] = []
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) newlineOffsets.push(i)
  }

  const countLinesBefore = (byte: number): number => {
    let lo = 0
    let hi = newlineOffsets.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (newlineOffsets[mid] < byte) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }

  const emitImportBlock = (nodeEndIndex: number): PyBlock => {
    const firstImport = importNodes[0]
    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, nodeEndIndex)
    const name = blockName(firstImport)
    const block: PyBlock = {
      kind: "import",
      name,
      startByte,
      endByte: nodeEndIndex,
      text: raw,
      startLine: countLinesBefore(firstImport.startIndex),
      cid: computeCid("import", name.value, raw),
      cidAlgo: "fnv1a64-norm1",
    }
    importNodes = []
    return block
  }

  const emitMiscBlock = (nodeEndIndex: number): PyBlock => {
    const first = miscNodes[0]
    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, nodeEndIndex)
    const block: PyBlock = {
      kind: "misc",
      name: anonymousName(),
      startByte,
      endByte: nodeEndIndex,
      text: raw,
      startLine: countLinesBefore(first.startIndex),
      cid: computeCid("misc", "anonymous", raw),
      cidAlgo: "fnv1a64-norm1",
    }
    miscNodes = []
    return block
  }

  const emitMdBlock = (nodeEndIndex: number): PyBlock => {
    const first = mdNodes[0]
    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, nodeEndIndex)
    const block: PyBlock = {
      kind: "markdown block",
      name: anonymousName(),
      startByte,
      endByte: nodeEndIndex,
      text: raw,
      startLine: countLinesBefore(first.startIndex),
      cid: computeCid("markdown block", "anonymous", raw),
      cidAlgo: "fnv1a64-norm1",
    }
    mdNodes = []
    return block
  }

  for (const [index, node] of tree.rootNode.children.entries()) {
    if (!node) continue

    // if this is the last node, extend its range to include any trailing content
    const isLastNode = index === tree.rootNode.children.length - 1
    const nodeEndIndex = isLastNode ? code.length : node.endIndex

    if (index === 0 && isDocstring(node)) {
      prevBlockEndByte = nodeEndIndex
      // Extract filename from path for module docstring naming
      const moduleName = filePath ? namedBlock(filename(filePath)) : anonymousName()
      const moduleDocCid = computeCid("module", moduleName.value, node.text)
      blocks.push({
        kind: "module",
        name: moduleName,
        startByte: node.startIndex,
        endByte: nodeEndIndex,
        text: code.slice(node.startIndex, nodeEndIndex),
        startLine: 1,
        cid: moduleDocCid,
        cidAlgo: "fnv1a64-norm1",
        doc: {
          kind: "doc",
          name: moduleName,
          startByte: node.startIndex,
          endByte: nodeEndIndex,
          text: dedentDocstring(code.slice(node.startIndex, nodeEndIndex)),
          startLine: 1,
          cid: moduleDocCid,
          cidAlgo: "fnv1a64-norm1",
        },
      })
      continue
    }

    const kind = blockKind(node)

    if (!kind) {
      if (node.type === "ERROR") continue
      if (node.type === "comment") {
        commentNodes.push(node)
        continue
      }

      // This is a misc node, so flush any pending blocks first.
      if (importNodes.length) {
        const importBlock = emitImportBlock(importNodes[importNodes.length - 1].endIndex)
        prevBlockEndByte = importBlock.endByte
        blocks.push(importBlock)
      }

      if (mdNodes.length) {
        const mdBlock = emitMdBlock(mdNodes[mdNodes.length - 1].endIndex)
        prevBlockEndByte = mdBlock.endByte
        blocks.push(mdBlock)
      }

      // anything else accumulates into a `misc` block
      // consume any accumulated comments
      miscNodes.push(...commentNodes, node)
      commentNodes = []

      continue
    }

    if (kind === "import") {
      // This is an import node, so flush any pending misc block first.
      if (miscNodes.length) {
        const miscBlock = emitMiscBlock(miscNodes[miscNodes.length - 1].endIndex)
        prevBlockEndByte = miscBlock.endByte
        blocks.push(miscBlock)
      }

      if (mdNodes.length) {
        const mdBlock = emitMdBlock(mdNodes[mdNodes.length - 1].endIndex)
        prevBlockEndByte = mdBlock.endByte
        blocks.push(mdBlock)
      }

      // consume any accumulated comments
      importNodes.push(...commentNodes, node)
      commentNodes = []

      // continue to next iteration
      continue
    }

    if (kind === "markdown block") {
      mdNodes.push(node)
      continue
    }

    // This is a "real" block (e.g., function/class).
    // Flush any pending block, whichever it may be.
    if (importNodes.length) {
      const importBlock = emitImportBlock(importNodes[importNodes.length - 1].endIndex)
      prevBlockEndByte = importBlock.endByte
      blocks.push(importBlock)
    }

    if (miscNodes.length) {
      const miscBlock = emitMiscBlock(miscNodes[miscNodes.length - 1].endIndex)
      prevBlockEndByte = miscBlock.endByte
      blocks.push(miscBlock)
    }

    if (mdNodes.length) {
      const mdBlock = emitMdBlock(mdNodes[mdNodes.length - 1].endIndex)
      prevBlockEndByte = mdBlock.endByte
      blocks.push(mdBlock)
    }

    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, nodeEndIndex)
    const name = blockName(node)

    const nodeFrom = commentNodes.length ? commentNodes[0].startIndex : node.startIndex

    commentNodes = []
    prevBlockEndByte = nodeEndIndex

    if (isDocablePyKind(kind)) {
      const docstringNode = findDocstringNode(node)
      if (docstringNode) {
        blocks.push({
          kind,
          name,
          startByte,
          endByte: nodeEndIndex,
          text: raw,
          startLine: countLinesBefore(nodeFrom),
          cid: computeCid(kind, name.value, raw),
          cidAlgo: "fnv1a64-norm1",
          doc: {
            kind: "doc",
            name: anonymousName(),
            startByte: docstringNode.startIndex,
            endByte: docstringNode.endIndex,
            text: dedentDocstring(docstringNode.text),
            startLine: countLinesBefore(docstringNode.startIndex),
            cid: computeCid("doc", "anonymous", docstringNode.text),
            cidAlgo: "fnv1a64-norm1",
          },
        })
        continue
      }
    }
    blocks.push({
      kind,
      name,
      startByte,
      endByte: nodeEndIndex,
      text: raw,
      startLine: countLinesBefore(nodeFrom),
      cid: computeCid(kind, name.value, raw),
      cidAlgo: "fnv1a64-norm1",
    })
  }

  if (importNodes.length) {
    const importEndIndex =
      miscNodes.length || mdNodes.length
        ? importNodes[importNodes.length - 1].endIndex
        : code.length
    const importBlock = emitImportBlock(importEndIndex)
    prevBlockEndByte = importBlock.endByte
    blocks.push(importBlock)
  }
  if (miscNodes.length) {
    const miscEndIndex = mdNodes.length ? miscNodes[miscNodes.length - 1].endIndex : code.length
    const miscBlock = emitMiscBlock(miscEndIndex)
    prevBlockEndByte = miscBlock.endByte
    blocks.push(miscBlock)
  }
  if (mdNodes.length) {
    const mdBlock = emitMdBlock(code.length)
    prevBlockEndByte = mdBlock.endByte
    blocks.push(mdBlock)
  }

  return blocks
}

/**
 * Parse Python content into blocks with fallback for empty/unparseable files.
 * Used by the IPC handler (main process) — accepts simple args, no EditorFile needed.
 */
export function parseBlocksForFile(code: string, filePath?: string): PyBlock[] {
  try {
    const blocks = parseCodeBlocks(code, filePath)

    // if no blocks were parsed, fall back to a single "module" block
    if (blocks.length === 0) {
      const moduleName = filePath ? namedBlock(filename(filePath)) : anonymousName()
      return [
        {
          kind: "module",
          name: moduleName,
          startByte: 0,
          endByte: code.length,
          text: code,
          startLine: 1,
          cid: computeCid("module", moduleName.value, code),
          cidAlgo: "fnv1a64-norm1",
        },
      ]
    }

    return blocks
  } catch (error) {
    console.warn("failed to parse python content into blocks:", error)

    const moduleName = filePath ? namedBlock(filename(filePath)) : anonymousName()
    return [
      {
        kind: "module",
        name: moduleName,
        startByte: 0,
        endByte: code.length,
        text: code,
        startLine: 1,
        cid: computeCid("module", moduleName.value, code),
        cidAlgo: "fnv1a64-norm1",
      },
    ]
  }
}

/**
 * Parse Python content into blocks with error handling.
 * Thin wrapper around parseBlocksForFile that accepts an EditorFile.
 */
export function parsePythonContent(file: EditorFile): PyBlock[] {
  return parseBlocksForFile(file.content, file.path)
}

/**
 * Serialize Python blocks back to source code.
 * This is used to test that parse/serialize is isomorphic.
 */
export function serializeBlocksToPython(blocks: PyBlock[]): string {
  return blocks.map((block) => block.text).join("")
}

function computeCid(kind: string, name: string, normalizedText: string): string {
  const sep = "\x1f"
  return fnv1a64Hex(kind + sep + name + sep + normalizedText)
}
