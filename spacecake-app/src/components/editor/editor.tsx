import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { useSelector } from "@xstate/react"
import { useAtomValue } from "jotai"
import {
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  type EditorState,
  type SerializedEditorState,
  $getRoot,
  $isDecoratorNode,
} from "lexical"
import * as React from "react"

import { nodes } from "@/components/editor/nodes"
import { Plugins } from "@/components/editor/plugins"
import {
  CODEMIRROR_SELECTION_COMMAND,
  type CodeMirrorSelectionPayload,
} from "@/components/editor/plugins/codemirror-commands"
import { OnChangePlugin } from "@/components/editor/plugins/on-change"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"
import { SourceEditor, type SourceEditorProps } from "@/components/editor/source-editor"
import { editorTheme } from "@/components/editor/theme"
import { SearchBar } from "@/components/search-bar"
import { useTheme } from "@/components/theme-provider"
import { RouteContext, useEditor, type CancelDebounceRef } from "@/contexts/editor-context"
import { useFocusablePanel } from "@/contexts/focus-manager"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { searchActorAtom } from "@/lib/atoms/search"
import { debounce } from "@/lib/utils"
import { type EditorExtendedSelection } from "@/types/claude-code"
import { type ChangeType, type SerializedSelection, type ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"

const selectSearchOpen = (snapshot: { value: unknown } | undefined) =>
  snapshot !== undefined &&
  typeof snapshot.value === "object" &&
  snapshot.value !== null &&
  "Open" in (snapshot.value as object)

interface EditorProps {
  editorConfig: InitialConfigType | null
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  /** version key — changes when the file, cid, or epoch changes. drives imperative content swap. */
  contentKey?: string
  filePath: AbsolutePath
  autosaveEnabled?: boolean
  viewKind?: ViewKind
  sourceData?: Omit<SourceEditorProps, "autosaveEnabled">

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
      COMMAND_PRIORITY_NORMAL,
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
  contentKey,
  filePath,
  autosaveEnabled,
  viewKind,
  sourceData,
  onChange,
  onCodeMirrorSelection,
}: EditorProps) {
  const context = React.useContext(RouteContext)
  const { editorRef } = useEditor()
  const { theme } = useTheme()
  const fileState = useAtomValue(getOrCreateFileStateAtom(filePath)).value
  const isDirty = fileState === "Dirty"

  // derive search open/closed from the machine state (single source of truth)
  const searchActor = useAtomValue(searchActorAtom)
  const searchOpen = useSelector(searchActor ?? undefined, selectSearchOpen) ?? false

  // Keep refs for unmount cleanup (can't use hooks in cleanup)
  const autosaveEnabledRef = React.useRef(autosaveEnabled)
  const isDirtyRef = React.useRef(isDirty)
  React.useEffect(() => {
    autosaveEnabledRef.current = autosaveEnabled
    isDirtyRef.current = isDirty
  }, [autosaveEnabled, isDirty])

  // Register editor with focus manager for Cmd+1 / Ctrl+1 support
  useFocusablePanel(
    "editor",
    React.useCallback(() => {
      const editor = editorRef.current
      if (!editor) return

      // Check if first child is a decorator node with a select() method
      // This handles source mode (single CodeBlockNode) and documents starting with decorators
      let focused = false
      editor.read(() => {
        const root = $getRoot()
        const firstChild = root.getFirstChild()
        if (firstChild && $isDecoratorNode(firstChild)) {
          // Decorator nodes like CodeBlockNode, MermaidNode, FrontmatterNode have select()
          if (typeof (firstChild as unknown as { select?: () => void }).select === "function") {
            ;(firstChild as unknown as { select: () => void }).select()
            focused = true
          }
        }
      })

      // Fall back to focusing the Lexical root element for regular text nodes
      if (!focused) {
        editor.getRootElement()?.focus()
      }
    }, [editorRef]),
  )

  // delay the ref update to useEffect so that useLayoutEffect cleanup
  // (which flushes the OLD file's pending state) reads the OLD handler.
  // useLayoutEffect cleanup runs before useEffect, guaranteeing correct ordering.
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const lastStateRef = React.useRef<EditorState | null>(null)
  // if a content change occurs in the debounce window,
  // subsequent selection changes will not downgrade the change type.
  const lastChangeTypeRef = React.useRef<ChangeType>("selection")

  // suppression flag: set to true during imperative content swaps so
  // OnChangePlugin skips persistence for events fired by setEditorState().
  const isSwappingContentRef = React.useRef(false)

  // tracks whether LexicalComposer has completed its initial mount.
  // null = not yet mounted, string = last contentKey we swapped to.
  const prevContentKeyRef = React.useRef<string | null>(null)

  // when editorConfig.editorState is a function (e.g. async Python parsing),
  // imperative swap is unsafe (calls resetRandomKey on a live editor).
  // instead, force a LexicalComposer remount by bumping this key.
  const [composerKey, setComposerKey] = React.useState(0)

  // 250ms debounce for PGlite state backup (crash recovery)
  const debouncedOnChangeRef = React.useRef(
    debounce(() => {
      if (lastStateRef.current) {
        onChangeRef.current(lastStateRef.current, lastChangeTypeRef.current)
        // reset for the next batch of changes
        lastStateRef.current = null
        lastChangeTypeRef.current = "selection"
      }
    }, 250),
  ).current

  // 1000ms debounce for autosave to disk
  const debouncedAutosaveRef = React.useRef(
    debounce(() => {
      editorRef.current?.dispatchCommand(SAVE_FILE_COMMAND, undefined)
    }, 1000),
  ).current

  // Expose the debounce cancel function through context
  React.useEffect(() => {
    if (context) {
      const cancelRef = context.cancelDebounceRef as CancelDebounceRef
      cancelRef.current = () => {
        debouncedOnChangeRef.cancel()
        debouncedAutosaveRef.cancel()
      }
    }
  }, [context, debouncedOnChangeRef, debouncedAutosaveRef])

  // --- imperative content swap for persistent editor ---
  // when contentKey changes (different file or reparse), flush the OLD file's
  // pending state and swap the lexical editor to the new content.
  // cleanup captures OLD values from the closure; setup runs with NEW values.
  //
  // string editorState (cached state from DB) → fast imperative swap via setEditorState().
  // function editorState (first-time content load, may be async e.g. Python parsing)
  //   → force a LexicalComposer remount since the function calls resetRandomKey()
  //     which is unsafe on a live editor with existing nodes.
  React.useLayoutEffect(() => {
    // skip source mode — SourceEditor handles its own lifecycle
    if (viewKind === "source") return

    const editor = editorRef.current

    // first mount: LexicalComposer consumes initialConfig, nothing to swap
    if (prevContentKeyRef.current === null) {
      prevContentKeyRef.current = contentKey ?? null
      return
    }

    // no change — nothing to do
    if (prevContentKeyRef.current === contentKey) return
    prevContentKeyRef.current = contentKey ?? null

    if (!editor || !editorConfig?.editorState) return

    if (typeof editorConfig.editorState === "string") {
      // cached state from DB — fast synchronous swap
      isSwappingContentRef.current = true
      const newState = editor.parseEditorState(editorConfig.editorState)
      editor.setEditorState(newState)
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
      // clear suppression after the current microtask — lexical dispatches
      // its internal update listeners synchronously during setEditorState().
      queueMicrotask(() => {
        isSwappingContentRef.current = false
      })
    } else {
      // function form (may be async, e.g. Python parsing) — force remount.
      // setComposerKey triggers a re-render; LexicalComposer unmounts and
      // remounts with the new initialConfig, same as the original behaviour.
      setComposerKey((k) => k + 1)
    }

    // cleanup: flush the OLD file's pending state with closure-captured values.
    // React guarantees cleanup sees values from the render that created it.
    return () => {
      debouncedOnChangeRef.cancel()
      debouncedAutosaveRef.cancel()

      // flush pending editor state to the file machine with the OLD onChange handler
      if (lastStateRef.current) {
        onChangeRef.current(lastStateRef.current, lastChangeTypeRef.current)
        lastStateRef.current = null
        lastChangeTypeRef.current = "selection"
      }

      // autosave if dirty
      if (autosaveEnabledRef.current && isDirtyRef.current) {
        editorRef.current?.dispatchCommand(SAVE_FILE_COMMAND, undefined)
      }
    }
  }, [contentKey, viewKind]) // eslint-disable-line react-hooks/exhaustive-deps

  // component unmount: flush pending state
  React.useEffect(() => {
    return () => {
      // On unmount, either save to disk (autosave) or flush to PGlite (crash recovery)
      if (autosaveEnabledRef.current && isDirtyRef.current) {
        // Autosave ON + dirty: save to disk (which clears PGlite anyway)
        debouncedOnChangeRef.cancel()
        debouncedAutosaveRef.cancel()
        editorRef.current?.dispatchCommand(SAVE_FILE_COMMAND, undefined)
      } else {
        // Autosave OFF or clean: flush pending changes to PGlite for crash recovery
        debouncedOnChangeRef.flush()
        debouncedOnChangeRef.cancel()
        debouncedAutosaveRef.cancel()
      }
    }
  }, [])

  // source mode: render pure CM6 editor instead of Lexical.
  if (viewKind === "source" && sourceData) {
    return (
      <div
        data-testid="lexical-editor"
        className="relative h-full"
        style={{ backgroundColor: theme === "dark" ? "#0d1117" : "#ffffff" }}
      >
        {searchOpen && <SearchBar />}
        <SourceEditor {...sourceData} autosaveEnabled={autosaveEnabled} />
      </div>
    )
  }

  if (!editorConfig) return null

  return (
    <div data-testid="lexical-editor" className="relative h-full">
      {searchOpen && <SearchBar />}
      <LexicalComposer
        key={composerKey}
        initialConfig={{
          ...editorConfig,
          ...(editorState ? { editorState } : {}),
          ...(editorSerializedState ? { editorState: JSON.stringify(editorSerializedState) } : {}),
        }}
      >
        <Plugins />

        <EditorRefPlugin editorRef={editorRef} />

        <CodeMirrorSelectionPlugin onSelection={onCodeMirrorSelection} />

        <OnChangePlugin
          onChange={(editorState, _editor, _tags, changeType) => {
            // skip persistence during imperative content swaps (file switch)
            if (isSwappingContentRef.current) return

            lastStateRef.current = editorState

            if (changeType === "content") {
              lastChangeTypeRef.current = "content"
            }

            // Don't debounce while saving or reparsing (editor is frozen anyway)
            if (fileState !== "Saving" && fileState !== "Reparsing") {
              debouncedOnChangeRef.schedule()

              // Schedule autosave if enabled and content changed
              if (changeType === "content" && autosaveEnabledRef.current) {
                debouncedAutosaveRef.schedule()
              }
            }
          }}
        />
      </LexicalComposer>
    </div>
  )
}
