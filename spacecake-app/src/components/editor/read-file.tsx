import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  LexicalEditor,
} from "lexical";
import type { FileType } from "@/components/editor/editor";

/**
 * Returns a function suitable for Lexical's editorState prop, which loads initial content
 * into the editor based on the file type (markdown or plaintext).
 */
export function getInitialEditorStateFromContent(
  content: string,
  fileType: FileType
) {
  return (editor: LexicalEditor) => {
    editor.update(() => {
      if (fileType === "markdown") {
        $convertFromMarkdownString(content, TRANSFORMERS);
      } else {
        // Plaintext fallback
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(content));
        root.append(paragraph);
      }
    });
  };
}
