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
  $isCodeBlockNode,
  CodeBlockNode,
} from "@/components/editor/nodes/code-node";
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
} from "@/components/editor/nodes/image-node";
import { $createNodeSelection, $setSelection, LexicalNode } from "lexical";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import { codeToBlock } from "@/lib/parser/python/blocks";
import { delimitedNode } from "@/components/editor/nodes/delimited";

export function createCodeTransformer(): MultilineElementTransformer {
  return {
    ...CODE,
    dependencies: [CodeBlockNode],
    export: (node: LexicalNode) => {
      if (!$isCodeBlockNode(node)) {
        return null;
      }
      const language = node.getLanguage();
      const textContent = node.getTextContent();

      if (language === "markdown") {
        return textContent;
      }
      return (
        "```" +
        (language || "") +
        (textContent ? "\n" + textContent : "") +
        "\n" +
        "```"
      );
    },
    replace: (rootNode, _children, startMatch, endMatch, linesInBetween) => {
      if (linesInBetween) {
        if (linesInBetween?.[0]?.trim().length === 0) {
          // Filter out all start and end lines that are length 0 until we find the first line with content
          while (linesInBetween.length > 0 && !linesInBetween[0].length) {
            linesInBetween.shift();
          }
        } else {
          // The first line already has content => Remove the first space of the line if it exists
          linesInBetween[0] = linesInBetween[0].startsWith(" ")
            ? linesInBetween[0].slice(1)
            : linesInBetween[0];
        }

        // Filter out all end lines that are length 0 until we find the last line with content
        while (
          linesInBetween.length > 0 &&
          !linesInBetween[linesInBetween.length - 1].length
        ) {
          linesInBetween.pop();
        }
      }

      const language = startMatch[1] ?? "";
      const code = linesInBetween?.join("\n") ?? "";

      const delimitedString = codeToBlock("\n" + code);

      const codeNode = delimitedNode(
        (text: string) =>
          $createCodeBlockNode({
            code: text,
            language: language,
            // meta: "",
            // src: "",
            // block: node.getBlock(),
          }),
        delimitedString
      );

      if (!rootNode.getParent()) {
        rootNode.append(codeNode);
      } else {
        rootNode.replace(codeNode);
      }

      const nodeSelection = $createNodeSelection();
      nodeSelection.add(codeNode.getKey());
      $setSelection(nodeSelection);

      // if no ending backticks, user has just created the code block
      if (!endMatch) {
        // refocus after replacement
        codeNode.select();
      }
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

  export: (node, exportChildren) => {
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
  IMAGE,
  ...TEXT_MATCH_TRANSFORMERS,
];
