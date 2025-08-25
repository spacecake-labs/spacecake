import type { PyBlock } from "@/types/parser";
import { docToBlock, codeToBlock } from "@/lib/parser/python/blocks";
import { delimitedNode } from "@/components/editor/nodes/delimited";
import { $createHeadingNode } from "@lexical/rich-text";
import { $createTextNode } from "lexical";
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node";

/**
 * Pure function that converts a Python block into a delimited Lexical node
 */
export function delimitPyBlock(block: PyBlock, filePath: string) {
  if (block.kind === "doc") {
    const delimitedString = docToBlock(block.text);
    return delimitedNode(
      (text: string) => $createHeadingNode("h2").append($createTextNode(text)),
      delimitedString
    );
  } else {
    const delimitedString = codeToBlock(block.text);
    return delimitedNode(
      (text: string) =>
        $createCodeBlockNode({
          code: text,
          language: "python",
          meta: String(block.kind),
          src: filePath,
          block: block,
        }),
      delimitedString
    );
  }
}
