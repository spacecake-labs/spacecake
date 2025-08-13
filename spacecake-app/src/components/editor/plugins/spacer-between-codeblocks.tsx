import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { $createParagraphNode, $getRoot, $isParagraphNode } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node";

export function SpacerBetweenCodeblocksPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.update(() => {
        const root = $getRoot();
        const children = root.getChildren();

        // simplified: there will be at most one top header
        const first = children[0];
        if (first && $isHeadingNode(first)) {
          const next = first.getNextSibling();
          if (!next || !$isParagraphNode(next)) {
            const spacer = $createParagraphNode();
            first.insertAfter(spacer);
          }
        } else {
          // no leading heading: ensure the document starts with a paragraph spacer
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

        // ensure a spacer paragraph after every codeblock
        for (let i = 0; i < children.length; i++) {
          const node = children[i];
          if ($isCodeBlockNode(node)) {
            const next = node.getNextSibling();
            if (!next || !$isParagraphNode(next)) {
              const spacer = $createParagraphNode();
              node.insertAfter(spacer);
            }
          }
        }
      });
    });
  }, [editor]);

  return null;
}
