import { parser } from "@lezer/python";
import { SyntaxNode } from "@lezer/common";
import type { PyBlock, PyBlockKind, PyBlockHigherKind, PyParsedFile } from "@/types/parser";

function blockKind(node: SyntaxNode): PyBlockKind | PyBlockHigherKind | null {
  switch (node.name) {
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

      const childKind = blockKind(definition);
      return childKind ? (`decorated ${childKind}` as PyBlockHigherKind) : null;
    }
    default:
      return null;
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

    if (kind === "import") {
      importNodes.push(node);
    } else {
      if (importNodes.length) {
        const lastImport = importNodes[importNodes.length - 1];
        yield {
          kind: "import",
          startByte: importNodes[0].from,
          endByte: lastImport.to,
          text: code.slice(importNodes[0].from, lastImport.to),
        };
      }
      importNodes = [];

      yield {
        kind,
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
      startByte: 0,
      endByte: content.length,
      text: content,
    };

    yield fallbackBlock;
  }
}

/**
 * Parse Python file into a complete PyParsedFile
 * Reads the file using Node.js fs and parses it directly
 */
export async function parsePythonFile(filePath: string): Promise<PyParsedFile> {
  // Read the file using Node.js fs (available in renderer process)
  const fileResult = await window.electronAPI.readFile(filePath);
  if (!fileResult.success || !fileResult.file) {
    throw new Error(fileResult.error || "failed to read file");
  }

  const file = fileResult.file;
  const blocks: PyBlock[] = [];

  for await (const block of parsePythonContentStreaming(file.content)) {
    blocks.push(block);
  }

  return {
    ...file,
    blocks,
  };
}

/**
 * Parse Python content directly (useful for testing)
 */
export async function parsePythonContent(content: string): Promise<PyBlock[]> {
  const blocks: PyBlock[] = [];

  for await (const block of parsePythonContentStreaming(content)) {
    blocks.push(block);
  }

  return blocks;
}
