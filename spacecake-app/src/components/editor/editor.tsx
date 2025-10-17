import * as React from "react"
import { useEditor } from "@/contexts/editor-context"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { type EditorState, type SerializedEditorState } from "lexical"

import { type ChangeType } from "@/types/lexical"
import { debounce } from "@/lib/utils"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import { OnChangePlugin } from "@/components/editor/plugins/on-change"
import { editorTheme } from "@/components/editor/theme"

interface EditorProps {
  editorConfig: InitialConfigType
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState

  onChange: (editorState: EditorState, changeType: ChangeType) => void
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

  const onChangeRef = React.useRef<EditorProps["onChange"]>(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const lastStateRef = React.useRef<EditorState | null>(null)
  // if a content change occurs in the debounce window,
  // subsequent selection changes will not downgrade the change type.
  const lastChangeTypeRef = React.useRef<ChangeType>("selection")

  const debouncedOnChangeRef = React.useRef(
    debounce(() => {
      if (lastStateRef.current) {
        onChangeRef.current(lastStateRef.current, lastChangeTypeRef.current)
        // reset for the next batch of changes
        lastStateRef.current = null
        lastChangeTypeRef.current = "selection"
      }
    }, 250)
  )

  React.useEffect(() => {
    return () => {
      debouncedOnChangeRef.current.flush()
      debouncedOnChangeRef.current.cancel()
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

        <EditorRefPlugin editorRef={editorRef} />

        <OnChangePlugin
          onChange={(editorState, editor, tags, changeType) => {
            lastStateRef.current = editorState

            if (changeType === "content") {
              lastChangeTypeRef.current = "content"
            }

            debouncedOnChangeRef.current.schedule()
          }}
        />
      </LexicalComposer>
    </div>
  )
}
