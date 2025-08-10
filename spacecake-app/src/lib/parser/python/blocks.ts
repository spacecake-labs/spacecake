import { parser } from "@lezer/python";
import { SyntaxNode } from "@lezer/common";
import type {
  PyBlock,
  PyBlockKind,
  PyBlockHigherKind,
  BlockName,
} from "@/types/parser";
import { anonymousName, namedBlock } from "@/types/parser";

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

  const emitImportBlock = (): PyBlock => {
    const firstImport = importNodes[0];
    const lastImport = importNodes[importNodes.length - 1];
    const block: PyBlock = {
      kind: "import",
      name: blockName(firstImport, code),
      startByte: firstImport.from,
      endByte: lastImport.to,
      text: code.slice(firstImport.from, lastImport.to),
    };
    importNodes = [];
    return block;
  };

  const emitMiscBlock = (): PyBlock => {
    const first = miscNodes[0];
    const last = miscNodes[miscNodes.length - 1];
    const block: PyBlock = {
      kind: "misc",
      name: anonymousName(),
      startByte: first.from,
      endByte: last.to,
      text: code.slice(first.from, last.to),
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

    if (importNodes.length) yield emitImportBlock();

    if (miscNodes.length) yield emitMiscBlock();

    // consume any accumulated comments
    const startByte = commentNodes.length ? commentNodes[0].from : node.from;
    const text = code.slice(startByte, node.to);
    commentNodes = [];
    yield {
      kind,
      name: blockName(node, code),
      startByte,
      endByte: node.to,
      text,
    };
  }
  if (importNodes.length) yield emitImportBlock();
  if (miscNodes.length) yield emitMiscBlock();
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
    };

    yield fallbackBlock;
  }
}
