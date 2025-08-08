import { parser } from "@lezer/python";
import { SyntaxNode } from "@lezer/common";
import type {
  PyBlock,
  PyBlockKind,
  PyBlockHigherKind,
  BlockName,
} from "@/types/parser";
import { anonymousName, namedBlock } from "@/types/parser";

function blockKind(node: SyntaxNode): PyBlockKind | PyBlockHigherKind | null {
  switch (node.name) {
    case "ClassDefinition":
      return "class";
    case "FunctionDefinition":
      return "function";
    case "ImportStatement":
      return "imports";
    case "ImportFromStatement":
      return "imports";
    case "DecoratedStatement": {
      // DecoratedStatement should have two children:
      // 1. Decorator
      // 2. ClassDefinition or FunctionDefinition
      const definition = node.firstChild?.nextSibling;
      if (!definition) return null;

      const childKind = blockKind(definition);
      return childKind ? (`decorated ${childKind}` as PyBlockHigherKind) : null;
    }
    default:
      return null;
  }
}

function blockName(node: SyntaxNode, code: string): BlockName {
  switch (node.name) {
    case "ClassDefinition": {
      // Find the class name (should be the first identifier after 'class')
      let child = node.firstChild;
      while (child) {
        if (child.name === "VariableName") {
          return namedBlock(code.slice(child.from, child.to));
        }
        child = child.nextSibling;
      }
      return namedBlock("UnnamedClass");
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
      return namedBlock("UnnamedFunction");
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
    const kind = blockKind(node);
    if (!kind) {
      continue;
    }

    if (kind === "imports") {
      importNodes.push(node);
    } else {
      if (importNodes.length) {
        const lastImport = importNodes[importNodes.length - 1];
        yield {
          kind: "imports",
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
        name: namedBlock("file"),
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
      name: namedBlock("file"),
      startByte: 0,
      endByte: content.length,
      text: content,
    };

    yield fallbackBlock;
  }
}
