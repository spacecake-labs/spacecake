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
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { useAtomValue } from "jotai"
import {
  COMMAND_PRIORITY_NORMAL,
  type EditorState,
  type SerializedEditorState,
} from "lexical"

import { type EditorExtendedSelection } from "@/types/claude-code"
import { type ChangeType, type SerializedSelection } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { debounce } from "@/lib/utils"
import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import {
  CODEMIRROR_SELECTION_COMMAND,
  type CodeMirrorSelectionPayload,
} from "@/components/editor/plugins/codemirror-editor"
import { OnChangePlugin } from "@/components/editor/plugins/on-change"
import { editorTheme } from "@/components/editor/theme"

interface EditorProps {
  editorConfig: InitialConfigType
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  filePath: AbsolutePath

  onChange: (editorState: EditorState, changeType: ChangeType) => void
  onCodeMirrorSelection?: (selection: EditorExtendedSelection) => void
}

// Plugin to listen for CodeMirror selection changes and forward them
function CodeMirrorSelectionPlugin({
  onSelection,
}: {
  onSelection?: (selection: EditorExtendedSelection) => void
}) {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!onSelection) return

    return editor.registerCommand<CodeMirrorSelectionPayload>(
      CODEMIRROR_SELECTION_COMMAND,
      (payload) => {
        const serializedSelection: SerializedSelection = {
          anchor: { key: payload.nodeKey, offset: payload.anchor },
          focus: { key: payload.nodeKey, offset: payload.head },
        }

        onSelection({
          selection: serializedSelection,
          selectedText: payload.selectedText,
          claudeSelection: payload.claudeSelection,
        })
        return true
      },
      COMMAND_PRIORITY_NORMAL
    )
  }, [editor, onSelection])

  return null
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
  onCodeMirrorSelection,
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
    <div data-testid="lexical-editor" className="relative h-full">
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

        <CodeMirrorSelectionPlugin onSelection={onCodeMirrorSelection} />

        <OnChangePlugin
          onChange={(editorState, _editor, _tags, changeType) => {
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

      {/* Animated indicator line while saving or reparsing */}
      {isSavingOrReparsing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 w-full bg-muted overflow-hidden z-50">
          <div
            className="h-full w-1/3 bg-primary"
            style={{
              animation: "slideShimmer 1.5s ease-in-out infinite",
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes slideShimmer {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(300%);
          }
          100% {
            transform: translateX(300%);
          }
        }
      `}</style>
    </div>
  )
}
