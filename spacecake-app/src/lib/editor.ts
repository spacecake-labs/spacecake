import { InitialConfigType } from "@lexical/react/LexicalComposer";
import { $createTextNode, SerializedEditorState } from "lexical";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType } from "@/types/workspace";
import { editorConfig } from "@/components/editor/editor";
import type { FileContent, FileTreeItem } from "@/types/workspace";
import { $getRoot, LexicalEditor } from "lexical";
import {
  $createCodeBlockNode,
  $isCodeBlockNode,
} from "@/components/editor/nodes/code-node";
import type { PyBlock } from "@/types/parser";
import { codeToBlock, docToBlock } from "@/lib/parser/python/blocks";
import {
  delimitedNode,
  $getDelimitedString,
} from "@/components/editor/nodes/delimited";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";

// Pure function to create editor config from serialized state
export const createEditorConfigFromState = (
  serializedState: SerializedEditorState
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: JSON.stringify(serializedState),
  };
};

// Pure function to create editor config from file content
export const createEditorConfigFromContent = (
  content: string,
  fileType: FileType,
  file?: FileContent
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: getInitialEditorStateFromContent(content, fileType, file),
  };
};

// Pure function to determine editor config based on current state
export const getEditorConfig = (
  editorState: SerializedEditorState | null,
  fileContent: FileContent | null,
  selectedFilePath: string | null
): InitialConfigType | null => {
  if (editorState) {
    return createEditorConfigFromState(editorState);
  }

  if (fileContent && selectedFilePath) {
    return createEditorConfigFromContent(
      fileContent.content,
      fileContent.fileType,
      fileContent // Pass the full file object
    );
  }

  return null;
};

/**
 * Serialize the Lexical editor contents back into a Python file string.
 * Traverses root children in order and concatenates block contents.
 * - code blocks: uses CodeBlockNode.getCode()
 * - non-code: uses text content via getTextContent()
 */
export function serializeEditorToPython(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    const children = root.getChildren();

    return children.reduce((result, child) => {
      if ($isCodeBlockNode(child)) {
        const delimitedString = $getDelimitedString(child);

        return result + delimitedString;
      }

      if ($isHeadingNode(child)) {
        const delimitedString = $getDelimitedString(child);

        return result + delimitedString;
      }

      const textContent = child.getTextContent();
      return result + (textContent.length > 0 ? textContent + "\n" : "");
    }, "");
  });
}

/**
 * Assemble a Python file by splicing updated code blocks back into the original baseline content.
 * This preserves non-code regions like the module docstring and comments exactly as-is.
 */
// baseline handling now lives in serializeEditorToPython
/**
 * Reconcile the current editor tree against a new set of parsed Python blocks.
 */
export function reconcilePythonBlocks(
  editor: LexicalEditor,
  filePath: FileTreeItem["path"],
  newBlocks: PyBlock[]
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();

    // process all blocks in order
    for (
      let reconciledBlockCount = 0;
      reconciledBlockCount < newBlocks.length;
      reconciledBlockCount++
    ) {
      const block = newBlocks[reconciledBlockCount];

      // If module docstring
      if (reconciledBlockCount === 0 && block.kind === "doc") {
        const delimitedString = docToBlock(block);
        // Create DelimitedNode instead of converting to markdown
        const moduleDocNode = delimitedNode(
          (text: string) =>
            $createHeadingNode("h2").append($createTextNode(text)),
          delimitedString
        );
        root.append(moduleDocNode);
      } else {
        const delimitedString = codeToBlock(block);
        const codeNode = delimitedNode(
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
        root.append(codeNode);
      }
    }
  });
}
