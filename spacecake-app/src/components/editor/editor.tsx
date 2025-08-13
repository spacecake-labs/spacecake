import * as React from "react";
import {
  LexicalComposer,
  InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState, SerializedEditorState } from "lexical";
import { nodes } from "@/components/editor/nodes";
import { Plugins } from "@/components/editor/plugins";
import { hasInitialLoadTag } from "@/types/editor";
import { debounce } from "@/lib/utils";

import { editorTheme } from "@/components/editor/theme";
// removed FileType re-export; import no longer needed

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
  const lastEditorStateRef = React.useRef<EditorState | null>(null);
  const onChangeRef = React.useRef<EditorProps["onChange"]>(onChange);
  const onSerializedChangeRef =
    React.useRef<EditorProps["onSerializedChange"]>(onSerializedChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  React.useEffect(() => {
    onSerializedChangeRef.current = onSerializedChange;
  }, [onSerializedChange]);

  const debouncedNotifyRef = React.useRef(
    debounce(() => {
      const es = lastEditorStateRef.current;
      if (!es) return;
      onChangeRef.current?.(es);
      onSerializedChangeRef.current?.(es.toJSON());
    }, 250)
  );

  React.useEffect(() => {
    return () => {
      debouncedNotifyRef.current.cancel();
    };
  }, []);

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
          onChange={(editorState, _editor, tags) => {
            if (hasInitialLoadTag(tags)) {
              return;
            }
            lastEditorStateRef.current = editorState;
            debouncedNotifyRef.current.schedule();
          }}
        />
      </LexicalComposer>
    </div>
  );
}
