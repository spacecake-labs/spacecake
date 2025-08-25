import { $convertFromMarkdownString } from "@lexical/markdown";
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  LexicalEditor,
} from "lexical";
import { INITIAL_LOAD_TAG } from "@/types/editor";
import { FileType } from "@/types/workspace";
import { parsePythonContentStreaming } from "@/lib/parser/python/blocks";
import type { FileContent } from "@/types/workspace";
import { toast } from "sonner";
import { convertToSourceView } from "@/lib/editor";
import { delimitPyBlock } from "./block-utils";

/**
 * Converts Python blocks into Lexical nodes with progressive rendering
 */
export async function convertPythonBlocksToLexical(
  content: string,
  file: FileContent,
  editor: LexicalEditor
) {
  try {
    // Start with an empty editor
    editor.update(() => {
      const root = $getRoot();
      root.clear();
    });
    // Parse blocks progressively, updating per block
    let parsedBlockCount = 0;
    for await (const block of parsePythonContentStreaming(content)) {
      editor.update(
        () => {
          const root = $getRoot();
          const delimitedNodeElement = delimitPyBlock(block, file.path);
          root.append(delimitedNodeElement);
        },
        { tag: INITIAL_LOAD_TAG }
      );
      parsedBlockCount++;
    }

    // If no blocks were parsed, fall back to plaintext
    if (parsedBlockCount === 0) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(content));
        root.append(paragraph);
      });
    }
  } catch {
    toast("failed to parse python file");
    // Fallback to plaintext
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(content));
      root.append(paragraph);
    });
  }
}

/**
 * Returns a function suitable for Lexical's editorState prop, which loads initial content
 * into the editor based on the file type and view preference.
 */
export function getInitialEditorStateFromContent(
  file: FileContent,
  viewKind?: "block" | "source"
) {
  return (editor: LexicalEditor) => {
    // If viewKind is explicitly provided, use it
    if (viewKind === "source") {
      convertToSourceView(file.content, file, editor);
      return;
    }

    // Default behavior based on file type
    if (file.fileType === FileType.Python) {
      // Python defaults to block view if no view specified
      convertPythonBlocksToLexical(file.content, file, editor);
    } else if (file.fileType === FileType.Markdown) {
      // Markdown defaults to block view (rendered markdown) when viewKind is "block" or undefined
      editor.update(() => {
        $convertFromMarkdownString(file.content, MARKDOWN_TRANSFORMERS);
      });
    } else if (file.fileType === FileType.Plaintext) {
      // Plaintext files go to plaintext view
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(file.content));
        root.append(paragraph);
      });
    } else {
      // All other programming languages (JS, TS, JSX, TSX) go to source view
      convertToSourceView(file.content, file, editor);
    }
  };
}
