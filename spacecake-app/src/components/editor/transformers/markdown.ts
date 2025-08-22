import {
  CODE,
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  type MultilineElementTransformer,
  type TextMatchTransformer,
} from "@lexical/markdown";
import {
  $createCodeBlockNode,
  CodeBlockNode,
} from "@/components/editor/nodes/code-node";
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
} from "@/components/editor/nodes/image-node";
import { $setSelection, $createNodeSelection } from "lexical";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";

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

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }

    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))/,
  regExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode({
      altText,
      maxWidth: 800,
      src,
    });
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match",
};

export const LINKED_IMAGE: TextMatchTransformer = {
  dependencies: [LinkNode, ImageNode],

  export: (node, exportChildren, exportFormat) => {
    console.log("LINKED_IMAGE.export", node, exportChildren, exportFormat);
    if (!$isLinkNode(node) || !$isImageNode(node.getFirstChild())) {
      return null;
    }
    const imageContent = exportChildren(node);
    return `[${imageContent}](${node.getURL()})`;
  },
  importRegExp: /\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
  regExp: /\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/,

  replace: (textNode, match) => {
    const [, altText, imageUrl, linkUrl, linkTitle] = match;

    const linkNode = $createLinkNode(linkUrl, { title: linkTitle });
    const imageNode = $createImageNode({
      altText,
      maxWidth: 800,
      src: imageUrl,
    });
    linkNode.append(imageNode);
    textNode.replace(linkNode);
  },
  trigger: ")",
  type: "text-match",
};

// Filter out conflicting code transformers
const MULTILINE_ELEMENT_TRANSFORMERS_FILTERED =
  MULTILINE_ELEMENT_TRANSFORMERS.filter((transformer) => {
    return !(
      "replace" in transformer &&
      typeof transformer.replace === "function" &&
      transformer.replace.toString().includes("$createCodeNode")
    );
  });

export const MARKDOWN_TRANSFORMERS = [
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  createCodeTransformer(),
  ...MULTILINE_ELEMENT_TRANSFORMERS_FILTERED,
  ...TEXT_FORMAT_TRANSFORMERS,
  LINKED_IMAGE,
  ...TEXT_MATCH_TRANSFORMERS,
  IMAGE,
];
