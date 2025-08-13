import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { $createParagraphNode, $getRoot, $isParagraphNode } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { CodeBlockNode } from "@/components/editor/nodes/code-node";

export function NodeSpacerPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // initial pass once to enforce leading spacer/header spacing
    editor.update(() => {
      const root = $getRoot();
      const children = root.getChildren();
      const first = children[0];
      if (first && $isHeadingNode(first)) {
        const next = first.getNextSibling();
        if (!next || !$isParagraphNode(next)) {
          const spacer = $createParagraphNode();
          first.insertAfter(spacer);
        }
      } else {
        if (first) {
          if (!$isParagraphNode(first)) {
            const spacer = $createParagraphNode();
            first.insertBefore(spacer);
          }
        } else {
          const spacer = $createParagraphNode();
          root.append(spacer);
        }
      }
    });

    // ensure a spacer after code blocks within the same update using a node transform
    const unregister = editor.registerNodeTransform(CodeBlockNode, (node) => {
      const next = node.getNextSibling();
      if (!next || !$isParagraphNode(next)) {
        const spacer = $createParagraphNode();
        node.insertAfter(spacer);
      }
    });

    return () => {
      unregister();
    };
  }, [editor]);

  return null;
}
