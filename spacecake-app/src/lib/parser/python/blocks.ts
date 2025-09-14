import { Node, Parser } from "web-tree-sitter"

import {
  anonymousName,
  BlockName,
  namedBlock,
  PyBlock,
  PyBlockHigherKind,
} from "@/types/parser"
import { fnv1a64Hex } from "@/lib/hash"
import languages from "@/lib/parser/languages"

const lang = await languages
const parser = new Parser()
parser.setLanguage(lang.Python)

export function isDataclass(node: Node): boolean {
  if (node.type !== "decorated_definition") return false

  const hasDataclassName = (decoratorNode: Node): boolean => {
    let found = false
    function walk(n: Node) {
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

export function isDocstring(node: Node): boolean {
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

  // Check if it's a triple-quoted string
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

export function isMdocString(node: Node): boolean {
  if (node.type !== "comment") return false
  return node.text.startsWith("#🍰")
}

export function blockKind(node: Node): PyBlock["kind"] | null {
  switch (node.type) {
    case "expression_statement": {
      if (isDocstring(node)) return "doc"
      return null
    }
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
      return `decorated ${childKind}` as PyBlockHigherKind
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

export function blockName(node: Node): BlockName {
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

export function* parseCodeBlocks(code: string): Generator<PyBlock> {
  const tree = parser.parse(code)
  if (!tree) throw new Error("failed to parse code")

  let importNodes: Node[] = []
  let miscNodes: Node[] = []
  let commentNodes: Node[] = []
  let mdNodes: Node[] = []
  let prevBlockEndByte = 0

  const countLinesBefore = (byte: number): number => {
    const before = code.substring(0, byte)
    const lines = (before.match(/\n/g) || []).length
    return lines + 1
  }

  const emitImportBlock = (): PyBlock => {
    const firstImport = importNodes[0]
    const lastImport = importNodes[importNodes.length - 1]

    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, lastImport.endIndex)
    const name = blockName(firstImport)
    const block: PyBlock = {
      kind: "import",
      name,
      startByte,
      endByte: lastImport.endIndex,
      text: raw,
      startLine: countLinesBefore(firstImport.startIndex),
      cid: computeCid("import", name.value, raw),
      cidAlgo: "fnv1a64-norm1",
    }
    importNodes = []
    return block
  }

  const emitMiscBlock = (): PyBlock => {
    const first = miscNodes[0]
    const last = miscNodes[miscNodes.length - 1]
    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, last.endIndex)
    const block: PyBlock = {
      kind: "misc",
      name: anonymousName(),
      startByte,
      endByte: last.endIndex,
      text: raw,
      startLine: countLinesBefore(first.startIndex),
      cid: computeCid("misc", "anonymous", raw),
      cidAlgo: "fnv1a64-norm1",
    }
    miscNodes = []
    return block
  }

  const emitMdBlock = (): PyBlock => {
    const first = mdNodes[0]
    const last = mdNodes[mdNodes.length - 1]
    const startByte = first.startIndex
    const raw = code.slice(startByte, last.endIndex)
    const block: PyBlock = {
      kind: "markdown block",
      name: anonymousName(),
      startByte,
      endByte: last.endIndex,
      text: raw,
      startLine: countLinesBefore(first.startIndex),
      cid: computeCid("markdown block", "anonymous", raw),
      cidAlgo: "fnv1a64-norm1",
    }
    mdNodes = []
    return block
  }

  for (const node of tree.rootNode.children) {
    if (!node) continue
    const kind = blockKind(node)

    if (!kind) {
      if (node.type === "ERROR") continue
      if (node.type === "comment") {
        commentNodes.push(node)
        continue
      }

      // This is a misc node, so flush any pending blocks first.
      if (importNodes.length) {
        const importBlock = emitImportBlock()
        prevBlockEndByte = importBlock.endByte
        yield importBlock
      }

      if (mdNodes.length) {
        const mdBlock = emitMdBlock()
        prevBlockEndByte = mdBlock.endByte
        yield mdBlock
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
        const miscBlock = emitMiscBlock()
        prevBlockEndByte = miscBlock.endByte
        yield miscBlock
      }

      if (mdNodes.length) {
        const mdBlock = emitMdBlock()
        prevBlockEndByte = mdBlock.endByte
        yield mdBlock
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
      const importBlock = emitImportBlock()
      prevBlockEndByte = importBlock.endByte
      yield importBlock
    }

    if (miscNodes.length) {
      const miscBlock = emitMiscBlock()
      prevBlockEndByte = miscBlock.endByte
      yield miscBlock
    }

    if (mdNodes.length) {
      const mdBlock = emitMdBlock()
      prevBlockEndByte = mdBlock.endByte
      yield mdBlock
    }

    const startByte = prevBlockEndByte
    const raw = code.slice(startByte, node.endIndex)
    const name = blockName(node)

    const nodeFrom = commentNodes.length
      ? commentNodes[0].startIndex
      : node.startIndex

    commentNodes = []
    prevBlockEndByte = node.endIndex

    yield {
      kind,
      name,
      startByte,
      endByte: node.endIndex,
      text: raw,
      startLine: countLinesBefore(nodeFrom),
      cid: computeCid(kind, name.value, raw),
      cidAlgo: "fnv1a64-norm1",
    }
  }

  if (importNodes.length) {
    const importBlock = emitImportBlock()
    yield importBlock
  }
  if (miscNodes.length) {
    const miscBlock = emitMiscBlock()
    yield miscBlock
  }
  if (mdNodes.length) {
    const mdBlock = emitMdBlock()
    yield mdBlock
  }
}

/**
 * Parse Python content into blocks with error handling
 * Returns a generator that yields blocks as they're parsed
 */
export function* parsePythonContentStreaming(
  content: string
): Generator<PyBlock> {
  try {
    let blockCount = 0
    for (const block of parseCodeBlocks(content)) {
      blockCount++
      yield block
    }

    // If no blocks were parsed, fall back to a single "module" block
    if (blockCount === 0) {
      const fallbackBlock: PyBlock = {
        kind: "module",
        name: anonymousName(),
        startByte: 0,
        endByte: content.length,
        text: content,
        startLine: 1,
        cid: computeCid("module", "anonymous", content),
        cidAlgo: "fnv1a64-norm1",
      }
      yield fallbackBlock
    }
  } catch (error) {
    console.warn("failed to parse python content into blocks:", error)

    // Fallback: create a single block with the entire content
    const fallbackBlock: PyBlock = {
      kind: "module",
      name: anonymousName(),
      startByte: 0,
      endByte: content.length,
      text: content,
      startLine: 1,
      cid: computeCid("module", "anonymous", content),
      cidAlgo: "fnv1a64-norm1",
    }

    yield fallbackBlock
  }
}

/**
 * Serialize Python blocks back to source code.
 * This is used to test that parse/serialize is isomorphic.
 */
export function serializeBlocksToPython(blocks: PyBlock[]): string {
  return blocks.map((block) => block.text).join("")
}

function computeCid(
  kind: string,
  name: string,
  normalizedText: string
): string {
  const sep = "\x1f"
  return fnv1a64Hex(kind + sep + name + sep + normalizedText)
}
