import { CODE, type MultilineElementTransformer } from "@lexical/markdown";
import {
  $createCodeBlockNode,
  CodeBlockNode,
} from "@/components/editor/nodes/code-node";
import { $setSelection, $createNodeSelection } from "lexical";

export function createCodeTransformer(): MultilineElementTransformer {
  return {
    ...CODE,
    dependencies: [CodeBlockNode],
    replace: (parentNode, _children, match) => {
      const codeBlockNode = $createCodeBlockNode({
        code: "",
        language: match[1] ?? "",
        meta: "",
      });

      // Replace the parent node and immediately select the new node
      parentNode.replace(codeBlockNode);
      const nodeSelection = $createNodeSelection();
      nodeSelection.add(codeBlockNode.getKey());
      $setSelection(nodeSelection);
    },
  };
}
