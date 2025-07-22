import * as React from "react";
import {
  LexicalComposer,
  InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState, SerializedEditorState } from "lexical";
import { nodes } from "@/components/editor/nodes";
import { Plugins } from "@/components/editor/plugins";

import { editorTheme } from "@/components/editor/theme";

export enum FileType {
  Markdown = "markdown",
  Plaintext = "plaintext",
}

interface EditorProps {
  editorConfig: InitialConfigType;
  editorState?: EditorState;
  editorSerializedState?: SerializedEditorState;
  onChange?: (editorState: EditorState) => void;
  onSerializedChange?: (editorSerializedState: SerializedEditorState) => void;
}

export const editorConfig: InitialConfigType = {
  namespace: "spacecake-editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error("editor error:", error);
  },
};

export function Editor({
  editorConfig,
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
}: EditorProps) {
  return (
    // <div className="bg-background overflow-hidden rounded-lg border">
    <div>
      <LexicalComposer
        initialConfig={{
          ...editorConfig,
          ...(editorState ? { editorState } : {}),
          ...(editorSerializedState
            ? { editorState: JSON.stringify(editorSerializedState) }
            : {}),
        }}
      >
        <Plugins />

        <OnChangePlugin
          ignoreSelectionChange={true}
          onChange={(editorState) => {
            onChange?.(editorState);
            onSerializedChange?.(editorState.toJSON());
          }}
        />
      </LexicalComposer>
    </div>
  );
}
