import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import type { Block, BlockKind, BlockHigherKind } from "@/types/parser";

const parser = new Parser();
parser.setLanguage(Python as Parser.Language);

function blockKind(
  node: Parser.SyntaxNode
): BlockKind | BlockHigherKind | null {
  switch (node.type) {
    case "class_definition":
      return "class";
    case "function_definition":
      return "function";
    case "import_statement":
      return "import";
    case "import_from_statement":
      return "import";
    case "decorated_definition": {
      const childKind = blockKind(node.children[1]);
      return childKind ? (`decorated ${childKind}` as BlockHigherKind) : null;
    }
    default:
      return null;
  }
}

export async function* parseCodeBlocks(code: string): AsyncGenerator<Block> {
  const tree = parser.parse(code);
  let importNodes: Parser.SyntaxNode[] = [];

  for (const node of tree.rootNode.children) {
    const kind = blockKind(node);
    if (!kind) {
      continue;
    }

    if (kind === "import") {
      importNodes.push(node);
    } else {
      if (importNodes.length)
        yield {
          kind: "import",
          startByte: importNodes[0].startIndex,
          endByte: importNodes[importNodes.length - 1].endIndex,
          text: code.slice(
            importNodes[0].startIndex,
            importNodes[importNodes.length - 1].endIndex
          ),
        };
      importNodes = [];

      yield {
        kind,
        startByte: node.startIndex,
        endByte: node.endIndex,
        text: node.text,
      };
    }
  }
}
