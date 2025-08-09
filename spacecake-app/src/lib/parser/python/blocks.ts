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

function blockKind(
  node: SyntaxNode,
  code: string
): PyBlockKind | PyBlockHigherKind | null {
  switch (node.name) {
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

  // Traverse the tree to find top-level nodes
  const topLevelNodes = getTopLevelNodes(tree.topNode);

  for (const node of topLevelNodes) {
    const kind = blockKind(node, code);
    if (!kind) {
      continue;
    }

    if (kind === "import") {
      importNodes.push(node);
    } else {
      if (importNodes.length) {
        const lastImport = importNodes[importNodes.length - 1];
        yield {
          kind: "import",
          name: blockName(importNodes[0], code),
          startByte: importNodes[0].from,
          endByte: lastImport.to,
          text: code.slice(importNodes[0].from, lastImport.to),
        };
      }
      importNodes = [];

      yield {
        kind,
        name: blockName(node, code),
        startByte: node.from,
        endByte: node.to,
        text: code.slice(node.from, node.to),
      };
    }
  }
}

// Helper function to get top-level nodes from Lezer tree
function getTopLevelNodes(rootNode: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];

  function traverse(node: SyntaxNode) {
    // Check if this is a top-level definition
    if (isTopLevelDefinition(node)) {
      nodes.push(node);
    } else {
      // Recursively traverse direct children
      let child = node.firstChild;
      while (child) {
        traverse(child);
        child = child.nextSibling;
      }
    }
  }

  traverse(rootNode);
  return nodes;
}

// Helper function to identify top-level definitions
function isTopLevelDefinition(node: SyntaxNode): boolean {
  const topLevelTypes = [
    "ClassDefinition",
    "FunctionDefinition",
    "ImportStatement",
    "ImportFromStatement",
    "DecoratedStatement",
    "IfStatement",
  ];

  return topLevelTypes.includes(node.name);
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
