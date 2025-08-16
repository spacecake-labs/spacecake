import { InitialConfigType } from "@lexical/react/LexicalComposer";
import { SerializedEditorState } from "lexical";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType } from "@/types/workspace";
import { editorConfig } from "@/components/editor/editor";
import type { FileContent } from "@/types/workspace";
import { $getRoot, LexicalEditor } from "lexical";
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node";
import { $isDelimitedNode } from "@/components/editor/nodes/delimited";
import type { PyBlock } from "@/types/parser";
import { CodeBlockNode } from "@/components/editor/nodes/code-node";
import { $createDelimitedNode } from "@/components/editor/nodes/delimited";
import { docToBlock } from "@/lib/parser/python/blocks";
// removed reconcile helper exports until external change handling is wired up

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
  let result = "";
  editor.getEditorState().read(() => {
    const root = $getRoot();
    const children = root.getChildren();

    for (const child of children) {
      if ($isCodeBlockNode(child)) {
        result += child.getCode();
        if (!result.endsWith("\n")) result += "\n";
      } else if ($isDelimitedNode(child)) {
        // Use the preserved delimiter information for perfect round-trip
        result += child.getSourceText();
        if (!result.endsWith("\n")) result += "\n";
      } else {
        const text = child.getTextContent();
        result += text;
        if (!result.endsWith("\n")) result += "\n";
      }
    }
  });
  return result;
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
  newBlocks: PyBlock[]
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();

    // process all blocks in order
    for (let i = 0; i < newBlocks.length; i++) {
      const block = newBlocks[i];

      if (String(block.kind) === "doc") {
        const delimitedString = docToBlock(block);
        const isModuleDocstring = i === 0;

        // Create DelimitedNode instead of converting to markdown
        const delimitedNode = $createDelimitedNode({
          delimitedString,
          level: isModuleDocstring ? 2 : 1,
        });

        root.append(delimitedNode);
      } else {
        // create code block for non-doc blocks
        const codeBlock = new CodeBlockNode(
          block.text,
          "python",
          String(block.kind),
          undefined,
          block
        );
        root.append(codeBlock);
      }
    }
  });
}
