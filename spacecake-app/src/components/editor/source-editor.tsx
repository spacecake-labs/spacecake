import { indentWithTab } from "@codemirror/commands"
import { search } from "@codemirror/search"
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state"
import { EditorView, type KeyBinding, keymap, lineNumbers } from "@codemirror/view"
import { useActorRef } from "@xstate/react"
import { basicSetup } from "codemirror"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"

import { focusedActiveLineTheme, foldPlaceholderTheme } from "@/components/editor/codemirror-shared"
import { blameAnnotation, emptyBlameAnnotation } from "@/components/editor/plugins/blame-annotation"
import { getLanguageSupport } from "@/components/editor/plugins/codemirror-editor"
import {
  diffGutterData,
  diffGutterStaticExtensions,
  emptyDiffGutterData,
} from "@/components/editor/plugins/diff-gutter"
import { githubDark, githubLight } from "@/components/editor/themes"
import { useTheme } from "@/components/theme-provider"
import { useFocusablePanel } from "@/contexts/focus-manager"
import { useMenuAction } from "@/hooks/use-menu-action"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { activeBlameAtom, activeLineDiffAtom } from "@/lib/atoms/git"
import { searchActorAtom } from "@/lib/atoms/search"
import { addPendingSave } from "@/lib/file-event-handler"
import { fnv1a64Hex } from "@/lib/hash"
import { externalSearchExtension } from "@/lib/search/cm-search-extension"
import { registerCmView, unregisterCmView } from "@/lib/search/cm-view-registry"
import {
  cmSelectionToLsp,
  extractCodeMirrorSelectionInfo,
  lspSelectionToCm,
} from "@/lib/selection-utils"
import { store } from "@/lib/store"
import { debounce } from "@/lib/utils"
import { fileMachine } from "@/machines/manage-file"
import { searchMachine } from "@/machines/search"
import { JsonValue } from "@/schema/drizzle-effect"
import type { EditorPrimaryKey } from "@/schema/editor"
import { EditorManager } from "@/services/editor-manager"
import { RuntimeClient } from "@/services/runtime-client"
import type { SelectionChangedPayload } from "@/types/claude-code"
import type { LspSelection } from "@/types/lsp"
import { AbsolutePath } from "@/types/workspace"

// registry key for the source editor's CM view
const SOURCE_VIEW_KEY = "__source__"

export interface SourceEditorProps {
  code: string
  language: string
  filePath: AbsolutePath
  workspacePath: AbsolutePath
  editorId: EditorPrimaryKey
  autosaveEnabled?: boolean
  initialSelection?: LspSelection | null
}

// subscribes to blame data and pushes into a codemirror compartment.
const BlameSync: React.FC<{
  viewRef: React.RefObject<EditorView | null>
  compartment: React.RefObject<Compartment>
}> = ({ viewRef, compartment }) => {
  const blameData = useAtomValue(activeBlameAtom)

  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: compartment.current.reconfigure(
        blameData.length > 0 ? blameAnnotation(blameData) : emptyBlameAnnotation(),
      ),
    })
  }, [blameData, viewRef, compartment])

  return null
}

// subscribes to line diff data and pushes into a codemirror compartment.
const DiffGutterSync: React.FC<{
  viewRef: React.RefObject<EditorView | null>
  compartment: React.RefObject<Compartment>
}> = ({ viewRef, compartment }) => {
  const lineDiffData = useAtomValue(activeLineDiffAtom)

  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: compartment.current.reconfigure(
        lineDiffData.length > 0 ? diffGutterData(lineDiffData) : emptyDiffGutterData(),
      ),
    })
  }, [lineDiffData, viewRef, compartment])

  return null
}

// creates the search machine for source mode (no lexical editor).
// content changes are sent manually from the CM updateListener.
function SourceSearchBridge() {
  const actorRef = useActorRef(searchMachine, { input: { editor: null } })

  React.useEffect(() => {
    store.set(searchActorAtom, actorRef)
    return () => {
      store.set(searchActorAtom, null)
    }
  }, [actorRef])

  return null
}

export function SourceEditor({
  code,
  language,
  filePath,
  workspacePath,
  editorId,
  autosaveEnabled,
  initialSelection,
}: SourceEditorProps) {
  const viewRef = React.useRef<EditorView | null>(null)
  const elRef = React.useRef<HTMLDivElement | null>(null)

  const fileState = useAtomValue(getOrCreateFileStateAtom(filePath)).value
  const isDirty = fileState === "Dirty"
  const sendFileState = useSetAtom(getOrCreateFileStateAtom(filePath))

  const fileMachineSend = useActorRef(fileMachine).send

  // refs for unmount cleanup
  const autosaveEnabledRef = React.useRef(autosaveEnabled)
  const isDirtyRef = React.useRef(isDirty)
  React.useEffect(() => {
    autosaveEnabledRef.current = autosaveEnabled
    isDirtyRef.current = isDirty
  }, [autosaveEnabled, isDirty])

  // compartments for dynamic concerns
  const themeCompartment = React.useRef(new Compartment())
  const languageCompartment = React.useRef(new Compartment())
  const blameCompartment = React.useRef(new Compartment())
  const diffGutterCompartment = React.useRef(new Compartment())

  const { theme } = useTheme()

  // --- debounced persistence ---

  const debouncedOnChange = React.useRef(
    debounce(() => {
      const view = viewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const sel = view.state.selection.main
      const lspSel = cmSelectionToLsp(view.state, sel.anchor, sel.head)

      fileMachineSend({
        type: "editor.state.update",
        editorState: {
          id: editorId,
          state: Schema.decodeUnknownSync(JsonValue)(text),
          selection: lspSel,
          view_kind: "source",
        },
      })
    }, 250),
  ).current

  const debouncedSelection = React.useRef(
    debounce(() => {
      const view = viewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const lspSel = cmSelectionToLsp(view.state, sel.anchor, sel.head)

      fileMachineSend({
        type: "editor.selection.update",
        editorSelection: {
          id: editorId,
          selection: lspSel,
        },
      })

      // notify Claude Code
      const { selectedText, claudeSelection } = extractCodeMirrorSelectionInfo(
        view.state,
        sel.anchor,
        sel.head,
      )
      if (window.electronAPI?.claude?.notifySelectionChanged) {
        const payload: SelectionChangedPayload = {
          text: selectedText,
          filePath,
          fileUrl: `file://${filePath}`,
          selection: claudeSelection,
        }
        window.electronAPI.claude.notifySelectionChanged(payload)
      }
    }, 250),
  ).current

  const debouncedAutosave = React.useRef(
    debounce(() => {
      handleSaveRef.current()
    }, 1000),
  ).current

  // --- save ---

  const handleSave = React.useCallback(() => {
    const view = viewRef.current
    if (!view) return

    debouncedOnChange.cancel()
    debouncedAutosave.cancel()

    const content = view.state.doc.toString()
    const cid = fnv1a64Hex(content)
    addPendingSave(filePath, cid)

    sendFileState({
      type: "file.save",
      content,
      viewKind: "source",
    })
  }, [filePath, sendFileState, debouncedOnChange, debouncedAutosave])

  const handleSaveRef = React.useRef(handleSave)
  handleSaveRef.current = handleSave

  const handleSaveAll = React.useCallback(async () => {
    handleSave()

    // save other dirty files from DB
    const pendingSaves = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const em = yield* EditorManager
        return yield* em.saveAll(workspacePath)
      }),
    )

    for (const save of pendingSaves) {
      if (save.filePath === filePath) continue
      addPendingSave(save.filePath, save.cid)
      store.set(getOrCreateFileStateAtom(save.filePath), {
        type: "file.save",
        content: save.content,
        viewKind: save.viewKind,
      })
    }
  }, [handleSave, filePath, workspacePath])

  // --- menu actions ---

  useMenuAction("save", handleSave)
  useMenuAction("save-all", handleSaveAll)

  // --- focus ---

  useFocusablePanel(
    "editor",
    React.useCallback(() => {
      viewRef.current?.focus()
    }, []),
  )

  // --- editor view lifecycle ---

  React.useEffect(() => {
    const el = elRef.current
    if (!el) return

    let isCancelled = false

    void (async () => {
      const languageExtension = await getLanguageSupport(language)
      if (isCancelled) return

      const saveKeymap: KeyBinding[] = [
        {
          key: "Mod-s",
          run: () => {
            handleSaveRef.current()
            return true
          },
        },
        {
          key: "Mod-Shift-s",
          run: () => {
            handleSaveAll()
            return true
          },
        },
      ]

      const extensions: Extension[] = [
        search({ top: true }),
        externalSearchExtension(),
        basicSetup,
        lineNumbers(),
        keymap.of([indentWithTab, ...saveKeymap]),
        EditorView.lineWrapping,
        // fill parent height, scroll internally, extend gutter for short files
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content, .cm-gutter": { minHeight: "100%" },
        }),
        themeCompartment.current.of(theme === "dark" ? githubDark : githubLight),
        languageCompartment.current.of(languageExtension ?? []),
        focusedActiveLineTheme,
        foldPlaceholderTheme,
        blameCompartment.current.of(emptyBlameAnnotation()),
        diffGutterStaticExtensions,
        diffGutterCompartment.current.of(emptyDiffGutterData()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            sendFileState({ type: "file.edit" })

            // read current file state from the store to avoid stale closures —
            // this effect only re-runs when `language` changes.
            const currentFileState = store.get(getOrCreateFileStateAtom(filePath)).value
            if (currentFileState !== "Saving" && currentFileState !== "Reparsing") {
              debouncedOnChange.schedule()
              if (autosaveEnabledRef.current) {
                debouncedAutosave.schedule()
              }
            }

            // notify search machine of content change
            const searchActor = store.get(searchActorAtom)
            if (searchActor) searchActor.send({ type: "search.content.change" })
          }
          if (update.selectionSet || update.docChanged) {
            debouncedSelection.schedule()
          }
        }),
      ]

      el.innerHTML = ""
      const view = new EditorView({
        parent: el,
        state: EditorState.create({ doc: code, extensions }),
      })
      viewRef.current = view

      // register with CM view registry for search
      registerCmView(SOURCE_VIEW_KEY, view)

      // notify search machine so it can retry a pending search
      const searchActor = store.get(searchActorAtom)
      if (searchActor) searchActor.send({ type: "search.content.change" })

      // restore selection
      if (initialSelection) {
        const { anchor, head } = lspSelectionToCm(view.state.doc, initialSelection)
        view.dispatch({
          selection: EditorSelection.create([EditorSelection.range(anchor, head)]),
        })
      }

      view.focus()
    })()

    return () => {
      isCancelled = true
      unregisterCmView(SOURCE_VIEW_KEY)
      debouncedOnChange.flush()
      debouncedSelection.cancel()
      debouncedAutosave.cancel()

      if (autosaveEnabledRef.current && isDirtyRef.current) {
        // autosave on unmount: save to disk
        handleSaveRef.current()
      }

      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [language])

  // handle theme changes dynamically
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.current.reconfigure(theme === "dark" ? githubDark : githubLight),
    })
  }, [theme])

  return (
    <div className="absolute inset-0 flex flex-col">
      <SourceSearchBridge />
      <BlameSync viewRef={viewRef} compartment={blameCompartment} />
      <DiffGutterSync viewRef={viewRef} compartment={diffGutterCompartment} />
      <div ref={elRef} className="flex-1 min-h-0" />
    </div>
  )
}
