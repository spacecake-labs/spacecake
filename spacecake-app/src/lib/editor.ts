import { InitialConfigType } from "@lexical/react/LexicalComposer";
import { SerializedEditorState } from "lexical";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType } from "@/types/workspace";
import { editorConfig } from "@/components/editor/editor";

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
  fileType: FileType
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: getInitialEditorStateFromContent(content, fileType),
  };
};

// Pure function to determine editor config based on current state
export const getEditorConfig = (
  editorState: SerializedEditorState | null,
  fileContent: { content: string; fileType: string } | null,
  selectedFilePath: string | null
): InitialConfigType | null => {
  if (editorState) {
    return createEditorConfigFromState(editorState);
  }

  if (fileContent && selectedFilePath) {
    return createEditorConfigFromContent(
      fileContent.content,
      fileContent.fileType as FileType
    );
  }

  return null;
};
