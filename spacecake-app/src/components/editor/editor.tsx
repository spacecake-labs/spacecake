import * as React from "react"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
// removed FileType re-export; import no longer needed
import { useAtomValue, useSetAtom } from "jotai"
import type { EditorState, LexicalEditor, SerializedEditorState } from "lexical"

import { hasInitialLoadTag } from "@/types/lexical"
import { isSavingAtom, lexicalEditorAtom } from "@/lib/atoms/atoms"
import { debounce } from "@/lib/utils"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import { editorTheme } from "@/components/editor/theme"

// no direct composer context usage; editor instance captured via OnChangePlugin

interface EditorProps {
  editorConfig: InitialConfigType
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  onChange?: (editorState: EditorState) => void
  onSerializedChange?: (editorSerializedState: SerializedEditorState) => void
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
  onSerializedChange,
}: EditorProps) {
  const setLexicalEditor = useSetAtom(lexicalEditorAtom)
  const isSaving = useAtomValue(isSavingAtom)
  const lastEditorStateRef = React.useRef<EditorState | null>(null)
  const onChangeRef = React.useRef<EditorProps["onChange"]>(onChange)
  const onSerializedChangeRef =
    React.useRef<EditorProps["onSerializedChange"]>(onSerializedChange)

  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  React.useEffect(() => {
    onSerializedChangeRef.current = onSerializedChange
  }, [onSerializedChange])

  const debouncedNotifyRef = React.useRef(
    debounce(() => {
      const es = lastEditorStateRef.current
      if (!es) return
      onChangeRef.current?.(es)
      onSerializedChangeRef.current?.(es.toJSON())
    }, 250)
  )

  React.useEffect(() => {
    return () => {
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
        <CaptureLexicalPlugin onCapture={setLexicalEditor} />
        <Plugins />

        <OnChangePlugin
          ignoreSelectionChange={true}
          onChange={(editorState, editor, tags) => {
            if (hasInitialLoadTag(tags)) {
              return
            }
            // always capture latest editor instance for save
            setLexicalEditor(editor)
            if (isSaving) return
            lastEditorStateRef.current = editorState
            debouncedNotifyRef.current.schedule()
          }}
        />
      </LexicalComposer>
    </div>
  )
}

// removed capture component in favor of OnChangePlugin one-liner above

const CaptureLexicalPlugin: React.FC<{
  onCapture: (ed: LexicalEditor) => void
}> = ({ onCapture }) => {
  const [editor] = useLexicalComposerContext()
  React.useEffect(() => {
    onCapture(editor)
  }, [editor, onCapture])
  return null
}
