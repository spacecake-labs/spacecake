import * as React from "react"
import { useEditor } from "@/contexts/editor-context"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import type { EditorState, SerializedEditorState } from "lexical"

import { hasInitialLoadTag } from "@/types/lexical"
import { debounce } from "@/lib/utils"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import { editorTheme } from "@/components/editor/theme"

interface EditorProps {
  editorConfig: InitialConfigType
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  onChange?: (editorState: EditorState) => void
}

export const editorConfig: InitialConfigType = {
  namespace: "spacecake-editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error("editor error:", error)
  },
}

export function Editor({
  editorConfig,
  editorState,
  editorSerializedState,
  onChange,
}: EditorProps) {
  const { editorRef } = useEditor()
  const lastEditorStateRef = React.useRef<EditorState | null>(null)
  const onChangeRef = React.useRef<EditorProps["onChange"]>(onChange)

  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const debouncedNotifyRef = React.useRef(
    debounce(() => {
      const es = lastEditorStateRef.current
      if (!es) return
      onChangeRef.current?.(es)
    }, 250)
  )

  React.useEffect(() => {
    return () => {
      debouncedNotifyRef.current.flush()
      debouncedNotifyRef.current.cancel()
    }
  }, [])

  return (
    <div data-testid="lexical-editor">
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
          onChange={(editorState, editor, tags) => {
            if (hasInitialLoadTag(tags)) {
              editorRef.current = editor
              return
            }
            lastEditorStateRef.current = editorState
            debouncedNotifyRef.current.schedule()
          }}
        />
      </LexicalComposer>
    </div>
  )
}
