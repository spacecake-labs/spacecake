import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  LexicalEditor,
} from "lexical";
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node";
import { $createDelimitedNode } from "@/components/editor/nodes/delimited";
import { INITIAL_LOAD_TAG } from "@/types/editor";
import type { FileType } from "@/types/workspace";
import {
  parsePythonContentStreaming,
  docToBlock,
} from "@/lib/parser/python/blocks";
import type { FileContent } from "@/types/workspace";
import { toast } from "sonner";

/**
 * Converts Python blocks into Lexical nodes with progressive rendering
 */
async function convertPythonBlocksToLexical(
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
    let blockCount = 0;
    let docstringCount = 0;
    for await (const block of parsePythonContentStreaming(content)) {
      blockCount++;
      editor.update(
        () => {
          const root = $getRoot();
          if (block.kind === "doc") {
            docstringCount++;
            const delimitedString = docToBlock(block);

            // Create DelimitedNode instead of converting to markdown
            const delimitedNode = $createDelimitedNode({
              delimitedString,
              level: docstringCount === 1 ? 2 : 1, // First docstring = h2, others = h1
            });

            root.append(delimitedNode);
          } else {
            const codeBlock = $createCodeBlockNode({
              code: block.text,
              language: "python",
              meta: String(block.kind),
              src: file.path,
              block: block,
            });
            root.append(codeBlock);
          }
        },
        { tag: INITIAL_LOAD_TAG }
      );
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
 * into the editor based on the file type (markdown, python, or plaintext).
 */
export function getInitialEditorStateFromContent(
  content: string,
  fileType: FileType,
  file?: FileContent
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
