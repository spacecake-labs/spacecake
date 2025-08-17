import { parser } from "@lezer/python";
import { SyntaxNode } from "@lezer/common";
import type {
  PyBlock,
  PyBlockKind,
  PyBlockHigherKind,
  BlockName,
  DelimitedString,
} from "@/types/parser";
import { anonymousName, namedBlock } from "@/types/parser";
import { parseDelimitedString } from "@/lib/parser/delimited-string";
import { fnv1a64Hex } from "@/lib/hash";

/**
 * Convert a docstring block to markdown header text.
 */
export function docToBlock(block: PyBlock): DelimitedString {
  // parseDelimitedString handles all the pattern matching automatically
  return parseDelimitedString(block.text, {
    prefixPattern: /^(r?""")/, // consume r""" or """ at start
    suffixPattern: /"""$/, // consume """ at end
  });
}

export function codeToBlock(block: PyBlock): DelimitedString {
  const result = parseDelimitedString(block.text, {
    prefixPattern: /^[\s\n]*/, // consume any leading whitespace and newlines
    suffixPattern: /[\s\n]*$/, // consume any trailing whitespace and newlines
  });
  console.log("codeToBlock - input:", block.text);
  console.log("codeToBlock - result:", result);
  return result;
}

function isDataclass(node: SyntaxNode, code: string): boolean {
  if (node.name !== "DecoratedStatement") return false;

  const hasDataclassName = (decorator: SyntaxNode): boolean => {
    // Check immediate children and one level deeper for a name token "dataclass".
    let nameChild: SyntaxNode | null = decorator.firstChild;
    while (nameChild) {
      if (
        (nameChild.name === "VariableName" ||
          nameChild.name === "PropertyName") &&
        code.slice(nameChild.from, nameChild.to) === "dataclass"
      ) {
        return true;
      }
      // one level deeper (to cover dotted paths like module.dataclass or call wrappers)
      let inner: SyntaxNode | null = nameChild.firstChild;
      while (inner) {
        if (
          (inner.name === "VariableName" || inner.name === "PropertyName") &&
          code.slice(inner.from, inner.to) === "dataclass"
        ) {
          return true;
        }
        inner = inner.nextSibling;
      }
      nameChild = nameChild.nextSibling;
    }
    return false;
  };

  let child: SyntaxNode | null = node.firstChild;
  while (child) {
    if (child.name === "Decorator" && hasDataclassName(child)) {
      return true;
    }
    child = child.nextSibling;
  }
  return false;
}

function isDocstring(node: SyntaxNode, code: string): boolean {
  if (node.name !== "ExpressionStatement") return false;
  const child = node.firstChild;
  if (child?.name !== "String") return false;

  const text = code.slice(node.from, node.to);

  if (!text.startsWith('"""') && !text.startsWith('r"""')) return false;

  return text.endsWith('"""');
}

function blockKind(
  node: SyntaxNode,
  code: string
): PyBlockKind | PyBlockHigherKind | null {
  switch (node.name) {
    case "ExpressionStatement": {
      if (isDocstring(node, code)) return "doc";
      return null;
    }
    case "ClassDefinition":
      return "class";
    case "FunctionDefinition":
      return "function";
    case "ImportStatement":
      return "import";
    case "ImportFromStatement":
      return "import";
    case "DecoratedStatement": {
      // DecoratedStatement should have two children:
      // 1. Decorator
      // 2. ClassDefinition or FunctionDefinition
      const definition = node.firstChild?.nextSibling;
      if (!definition) return null;

      const childKind = blockKind(definition, code);
      if (!childKind) return null;
      if (childKind === "class" && isDataclass(node, code)) {
        return "dataclass";
      }
      return `decorated ${childKind}` as PyBlockHigherKind;
    }
    case "IfStatement": {
      // Detect top-level if __name__ == '__main__' or "__main__"
      // Check that the if condition matches the __name__ main guard
      const conditionNode = node.getChild("BinaryExpression");
      if (!conditionNode) return null;
      const conditionText = code.slice(conditionNode.from, conditionNode.to);
      if (/^__name__\s*==\s*(['"])__main__\1$/.test(conditionText)) {
        return "main";
      }
      return null;
    }
    default:
      return null;
  }
}

function blockName(node: SyntaxNode, code: string): BlockName {
  switch (node.name) {
    case "IfStatement":
      return anonymousName();
    case "ClassDefinition": {
      // Find the class name (should be the first identifier after 'class')
      let child = node.firstChild;
      while (child) {
        if (child.name === "VariableName") {
          return namedBlock(code.slice(child.from, child.to));
        }
        child = child.nextSibling;
      }
      return anonymousName();
    }
    case "FunctionDefinition": {
      // Find the function name (should be the first identifier after 'def')
      let child = node.firstChild;
      while (child) {
        if (child.name === "VariableName") {
          return namedBlock(code.slice(child.from, child.to));
        }
        child = child.nextSibling;
      }
      return anonymousName();
    }
    case "ImportStatement":
    case "ImportFromStatement": {
      // For import blocks, return anonymous
      return anonymousName();
    }
    case "DecoratedStatement": {
      // For decorated statements, get the name from the underlying definition
      const definition = node.firstChild?.nextSibling;
      if (definition) {
        return blockName(definition, code);
      }
      return namedBlock("decorated");
    }
    default:
      return anonymousName();
  }
}

export async function* parseCodeBlocks(code: string): AsyncGenerator<PyBlock> {
  const tree = parser.parse(code);
  let importNodes: SyntaxNode[] = [];
  let miscNodes: SyntaxNode[] = [];
  // comments accumulate into the next recognised block
  let commentNodes: SyntaxNode[] = [];
  let prevBlockEndByte = 0;

  // calculate line number for a block, accounting for prefix whitespace
  const countLinesBefore = (byte: number): number => {
    const before = code.substring(0, byte);
    const lines = (before.match(/\n/g) || []).length;
    return lines + 1;
  };

  const emitImportBlock = (): PyBlock => {
    const firstImport = importNodes[0];
    const lastImport = importNodes[importNodes.length - 1];

    const startByte = prevBlockEndByte;
    const raw = code.slice(startByte, lastImport.to);
    const block: PyBlock = {
      kind: "import",
      name: blockName(firstImport, code),
      startByte,
      endByte: lastImport.to,
      text: raw,
      startLine: countLinesBefore(firstImport.from),
      cid: computeCid("import", blockName(firstImport, code).value, raw),
      cidAlgo: "fnv1a64-norm1",
    };
    importNodes = [];
    return block;
  };

  const emitMiscBlock = (): PyBlock => {
    const first = miscNodes[0];
    const last = miscNodes[miscNodes.length - 1];
    const startByte = prevBlockEndByte;
    const raw = code.slice(startByte, last.to);
    const block: PyBlock = {
      kind: "misc",
      name: anonymousName(),
      startByte,
      endByte: last.to,
      text: raw,
      startLine: countLinesBefore(first.from),
      cid: computeCid("misc", "anonymous", raw),
      cidAlgo: "fnv1a64-norm1",
    };
    miscNodes = [];
    return block;
  };

  for (
    let node: SyntaxNode | null = tree.topNode.firstChild;
    node;
    node = node.nextSibling
  ) {
    const kind = blockKind(node, code);

    if (!kind) {
      // skip error nodes
      if (node.name === "⚠") continue;
      // comments accumulate into the next recognised block
      if (node.name === "Comment") {
        commentNodes.push(node);
        continue;
      }
      // anything else accumulates into a `misc` block
      // consume any accumulated comments
      miscNodes.push(...commentNodes, node);
      commentNodes = [];
      continue;
    }
    // else if it's a recognised block kind

    if (kind === "import") {
      // consume any accumulated comments
      importNodes.push(...commentNodes, node);
      commentNodes = [];
      continue;
    }

    if (importNodes.length) {
      const importBlock = emitImportBlock();
      console.log(
        `DEBUG: import block - endByte: ${importBlock.endByte}, prevBlockEndByte updated to: ${importBlock.endByte}`
      );
      prevBlockEndByte = importBlock.endByte;
      yield importBlock;
    }

    if (miscNodes.length) {
      const miscBlock = emitMiscBlock();
      console.log(
        `DEBUG: misc block - endByte: ${miscBlock.endByte}, prevBlockEndByte updated to: ${miscBlock.endByte}`
      );
      prevBlockEndByte = miscBlock.endByte;
      yield miscBlock;
    }

    const startByte = prevBlockEndByte;
    const raw = code.slice(startByte, node.to);
    const name = blockName(node, code);

    const nodeFrom = commentNodes.length ? commentNodes[0].from : node.from;

    commentNodes = [];
    prevBlockEndByte = node.to;

    yield {
      kind,
      name,
      startByte,
      endByte: node.to,
      text: raw,
      startLine: countLinesBefore(nodeFrom),
      cid: computeCid(kind, name.value, raw),
      cidAlgo: "fnv1a64-norm1",
    };
  }

  if (importNodes.length) {
    const importBlock = emitImportBlock();
    yield importBlock;
  }
  if (miscNodes.length) {
    const miscBlock = emitMiscBlock();
    yield miscBlock;
  }
}

/**
 * Parse Python content into blocks with error handling
 * Returns a generator that yields blocks as they're parsed
 */
export async function* parsePythonContentStreaming(
  content: string
): AsyncGenerator<PyBlock> {
  try {
    let blockCount = 0;
    for await (const block of parseCodeBlocks(content)) {
      blockCount++;
      yield block;
    }

    // If no blocks were parsed, fall back to a single "file" block
    if (blockCount === 0) {
      const fallbackBlock: PyBlock = {
        kind: "file",
        name: anonymousName(),
        startByte: 0,
        endByte: content.length,
        text: content,
        startLine: 1,
        cid: computeCid("file", "anonymous", content),
        cidAlgo: "fnv1a64-norm1",
      };
      yield fallbackBlock;
    }
  } catch (error) {
    console.warn("failed to parse python content into blocks:", error);

    // Fallback: create a single block with the entire content
    const fallbackBlock: PyBlock = {
      kind: "file",
      name: anonymousName(),
      startByte: 0,
      endByte: content.length,
      text: content,
      startLine: 1,
      cid: computeCid("file", "anonymous", content),
      cidAlgo: "fnv1a64-norm1",
    };

    yield fallbackBlock;
  }
}

/**
 * Serialize Python blocks back to source code.
 * This is used to test that parse/serialize is isomorphic.
 */
export function serializeBlocksToPython(blocks: PyBlock[]): string {
  return blocks.map((block) => block.text).join("");
}

function computeCid(
  kind: string,
  name: string,
  normalizedText: string
): string {
  const sep = "\x1f";
  return fnv1a64Hex(kind + sep + name + sep + normalizedText);
}
