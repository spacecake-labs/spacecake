import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  LexicalEditor,
} from "lexical";
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node";
import type { FileType } from "@/components/editor/editor";
import { parsePythonContentStreaming } from "@/lib/parser/python/parser";
import type { File } from "@/types/workspace";

/**
 * Converts Python blocks into Lexical nodes with progressive rendering
 */
async function convertPythonBlocksToLexical(
  content: string,
  file: File,
  editor: LexicalEditor
) {
  try {
    // Start with an empty editor
    editor.update(() => {
      const root = $getRoot();
      root.clear();
    });

    // Parse blocks progressively
    let blockCount = 0;
    for await (const block of parsePythonContentStreaming(content)) {
      blockCount++;

      // Add each block as it's parsed
      editor.update(() => {
        const codeBlock = $createCodeBlockNode({
          code: block.text,
          language: "python",
          meta: block.kind, // Store block type as metadata
          src: file.path, // Store source file path
        });

        const root = $getRoot();
        root.append(codeBlock);
      });
    }

    // If no blocks were parsed, fall back to plaintext
    if (blockCount === 0) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(content));
        root.append(paragraph);
      });
    }
  } catch (error) {
    console.warn(
      "failed to parse python file, falling back to plaintext:",
      error
    );
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
 * into the editor based on the file type (markdown, python, or plaintext).
 */
export function getInitialEditorStateFromContent(
  content: string,
  fileType: FileType,
  file?: File
) {
  return (editor: LexicalEditor) => {
    if (fileType === "python" && file) {
      // Handle Python files asynchronously with progressive rendering
      convertPythonBlocksToLexical(content, file, editor);
    } else if (fileType === "markdown") {
      // Handle markdown files
      editor.update(() => {
        $convertFromMarkdownString(content, TRANSFORMERS);
      });
    } else {
      // Plaintext fallback
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(content));
        root.append(paragraph);
      });
    }
  };
}
