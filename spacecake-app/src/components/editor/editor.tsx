import * as React from "react"
import {
  RouteContext,
  useEditor,
  type CancelDebounceRef,
} from "@/contexts/editor-context"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { useAtomValue } from "jotai"
import { type EditorState, type SerializedEditorState } from "lexical"

import { type ChangeType } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { debounce } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import { OnChangePlugin } from "@/components/editor/plugins/on-change"
import { editorTheme } from "@/components/editor/theme"

interface EditorProps {
  editorConfig: InitialConfigType
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  filePath: AbsolutePath

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
  filePath,
  onChange,
}: EditorProps) {
  const context = React.useContext(RouteContext)
  const { editorRef } = useEditor()
  const fileState = useAtomValue(fileStateAtomFamily(filePath)).value

  const isSavingOrReparsing =
    fileState === "Saving" || fileState === "Reparsing"

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
  ).current

  // Expose the debounce cancel function through context
  React.useEffect(() => {
    if (context) {
      const cancelRef = context.cancelDebounceRef as CancelDebounceRef
      cancelRef.current = () => {
        debouncedOnChangeRef.cancel()
      }
    }
  }, [context, debouncedOnChangeRef])

  React.useEffect(() => {
    return () => {
      debouncedOnChangeRef.flush()
      debouncedOnChangeRef.cancel()
    }
  }, [])

  return (
    <div data-testid="lexical-editor" className="relative">
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

            // Don't debounce while saving or reparsing (editor is frozen anyway)
            if (fileState !== "Saving" && fileState !== "Reparsing") {
              debouncedOnChangeRef.schedule()
            }
          }}
        />
      </LexicalComposer>

      {/* Visual feedback overlay while saving or reparsing */}
      {isSavingOrReparsing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 rounded-lg backdrop-blur-sm z-50 pointer-events-none">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-lg">
            <Spinner className="w-4 h-4" />
            <span className="text-sm font-medium text-muted-foreground">
              {fileState === "Saving" ? "saving..." : "updating..."}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
