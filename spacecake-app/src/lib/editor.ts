import { InitialConfigType } from "@lexical/react/LexicalComposer";
import { SerializedEditorState } from "lexical";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType } from "@/types/workspace";
import { editorConfig } from "@/components/editor/editor";
import type { File } from "@/types/workspace";
import { $getRoot, LexicalEditor } from "lexical";
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node";

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
  file?: File
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: getInitialEditorStateFromContent(content, fileType, file),
  };
};

// Pure function to determine editor config based on current state
export const getEditorConfig = (
  editorState: SerializedEditorState | null,
  fileContent: File | null,
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
export function serializeEditorToPython(
  editor: LexicalEditor,
  options?: { baseline?: string }
): string {
  const baseline = options?.baseline ?? null;
  if (baseline !== null) {
    let result = "";
    let cursor = 0;
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      for (const child of children) {
        if ($isCodeBlockNode(child)) {
          const block = child.getBlock();
          const start = block.startByte;
          const end = block.endByte;
          if (start > cursor) {
            result += baseline.slice(cursor, start);
          }
          result += child.getCode();
          cursor = end;
        }
      }
    });
    if (cursor < baseline.length) result += baseline.slice(cursor);
    return result;
  }

  let result = "";
  editor.getEditorState().read(() => {
    const root = $getRoot();
    const children = root.getChildren();
    for (const child of children) {
      if ($isCodeBlockNode(child)) {
        result += child.getCode();
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
