import { Compartment, EditorSelection, type Extension } from "@codemirror/state"
import { EditorView, type KeyBinding } from "@codemirror/view"
import { useActorRef } from "@xstate/react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"

import { blameAnnotation, emptyBlameAnnotation } from "@/components/editor/plugins/blame-annotation"
import { getLanguageSupport } from "@/components/editor/plugins/codemirror-editor"
import { diffGutterData, emptyDiffGutterData } from "@/components/editor/plugins/diff-gutter"
import { githubDark, githubLight } from "@/components/editor/themes"
import { useTheme } from "@/components/theme-provider"
import { useFocusablePanel } from "@/contexts/focus-manager"
import { useMenuAction } from "@/hooks/use-menu-action"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { activeBlameAtom, activeLineDiffAtom } from "@/lib/atoms/git"
import { searchActorAtom } from "@/lib/atoms/search"
import { addPendingSave } from "@/lib/file-event-handler"
import { fnv1a64Hex } from "@/lib/hash"
import { registerCmView, unregisterCmView } from "@/lib/search/cm-view-registry"
import {
  cmSelectionToLsp,
  extractCodeMirrorSelectionInfo,
  lspSelectionToCm,
} from "@/lib/selection-utils"
import { buildSourceEditorState } from "@/lib/source-editor-state"
import {
  destroySourceView,
  getSourceView,
  initSourceView,
  recycleSourceView,
} from "@/lib/source-view-pool"
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
  /** pre-resolved language extension from cache, or null if not yet cached */
  languageExtension?: Extension | null
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
  languageExtension: languageExtensionProp,
  filePath,
  workspacePath,
  editorId,
  autosaveEnabled,
  initialSelection,
}: SourceEditorProps) {
  const viewRef = React.useRef<EditorView | null>(null)
  const elRef = React.useRef<HTMLDivElement | null>(null)

  // refs for mutable per-file state — avoids stale closures in debounce callbacks
  const filePathRef = React.useRef(filePath)
  const editorIdRef = React.useRef(editorId)
  const initialSelectionRef = React.useRef(initialSelection)
  const languageExtensionRef = React.useRef(languageExtensionProp)
  filePathRef.current = filePath
  editorIdRef.current = editorId
  initialSelectionRef.current = initialSelection
  languageExtensionRef.current = languageExtensionProp

  const fileState = useAtomValue(getOrCreateFileStateAtom(filePath)).value
  const isDirty = fileState === "Dirty"
  const sendFileState = useSetAtom(getOrCreateFileStateAtom(filePath))

  const sendFileStateRef = React.useRef(sendFileState)
  sendFileStateRef.current = sendFileState

  const fileMachineSend = useActorRef(fileMachine).send

  // refs for unmount cleanup
  const autosaveEnabledRef = React.useRef(autosaveEnabled)
  const isDirtyRef = React.useRef(isDirty)
  React.useEffect(() => {
    autosaveEnabledRef.current = autosaveEnabled
    isDirtyRef.current = isDirty
  }, [autosaveEnabled, isDirty])

  // compartment refs — updated each time we build a new EditorState.
  // BlameSync / DiffGutterSync read .current, which always points to
  // the compartment from the latest state.
  const themeCompartment = React.useRef(new Compartment())
  const blameCompartment = React.useRef(new Compartment())
  const diffGutterCompartment = React.useRef(new Compartment())
  const deferredCompartment = React.useRef(new Compartment())
  const deferredIdleRef = React.useRef<number | null>(null)

  const { theme } = useTheme()
  const themeRef = React.useRef(theme)
  themeRef.current = theme

  // --- debounced persistence (all closures read from refs) ---

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
          id: editorIdRef.current,
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
          id: editorIdRef.current,
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
          filePath: filePathRef.current,
          fileUrl: `file://${filePathRef.current}`,
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

  // --- save (all reads from refs) ---

  const handleSave = React.useCallback(() => {
    const view = viewRef.current
    if (!view) return

    debouncedOnChange.cancel()
    debouncedAutosave.cancel()

    const content = view.state.doc.toString()
    const cid = fnv1a64Hex(content)
    addPendingSave(filePathRef.current, cid)

    sendFileStateRef.current({
      type: "file.save",
      content,
      viewKind: "source",
    })
  }, [debouncedOnChange, debouncedAutosave])

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
      if (save.filePath === filePathRef.current) continue
      addPendingSave(save.filePath, save.cid)
      store.set(getOrCreateFileStateAtom(save.filePath), {
        type: "file.save",
        content: save.content,
        viewKind: save.viewKind,
      })
    }
  }, [handleSave, workspacePath])

  const handleSaveAllRef = React.useRef(handleSaveAll)
  handleSaveAllRef.current = handleSaveAll

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

  // suppression flag: set to true during programmatic content swaps (recycle/init)
  // so the update listener skips persistence for docChanged events from setState().
  const isSwappingContentRef = React.useRef(false)

  // shared cleanup: flush pending state and autosave if needed.
  // only flushes debouncedOnChange if there is actually a pending timer —
  // unconditional flush would persist stale/empty state during content swaps.
  const flushPendingWork = React.useCallback(() => {
    if (debouncedOnChange.isScheduled()) {
      debouncedOnChange.flush()
    }
    debouncedSelection.cancel()
    debouncedAutosave.cancel()
    if (autosaveEnabledRef.current && isDirtyRef.current) {
      handleSaveRef.current()
    }
  }, [debouncedOnChange, debouncedSelection, debouncedAutosave])

  // --- editor view lifecycle ---
  // runs when file/code/language changes. on first call creates the view;
  // on subsequent calls recycles it via view.setState().

  React.useEffect(() => {
    const el = elRef.current
    if (!el) return

    let isCancelled = false

    const setup = (langExt: Extension | null) => {
      if (isCancelled) return

      // build the update listener with current refs.
      // checks isSwappingContentRef to skip persistence during programmatic
      // content swaps (recycle/init), which fire docChanged but shouldn't
      // mark the file dirty or schedule persistence.
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // skip persistence during programmatic content swaps
          if (isSwappingContentRef.current) return

          sendFileStateRef.current({ type: "file.edit" })

          // read current file state from the store to avoid stale closures
          const currentFileState = store.get(getOrCreateFileStateAtom(filePathRef.current)).value
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
          // skip selection persistence during programmatic content swaps
          if (isSwappingContentRef.current) return
          debouncedSelection.schedule()
        }
      })

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
            handleSaveAllRef.current()
            return true
          },
        },
      ]

      const result = buildSourceEditorState({
        code,
        languageExtension: langExt,
        theme: themeRef.current,
        updateListener,
        saveKeymap,
      })

      // update compartment refs so BlameSync/DiffGutterSync/theme dispatch to the right targets
      themeCompartment.current = result.compartments.theme
      blameCompartment.current = result.compartments.blame
      diffGutterCompartment.current = result.compartments.diffGutter
      deferredCompartment.current = result.compartments.deferred

      // suppress persistence for the setState() call — it fires docChanged
      // but this is a programmatic content swap, not a user edit.
      isSwappingContentRef.current = true

      const existingView = getSourceView()
      let view: EditorView
      if (existingView) {
        // recycle: swap document/state without destroying the root DOM or event handlers
        recycleSourceView(result.state)
        view = existingView
      } else {
        // first open: create the view
        view = initSourceView(el, result.state)
      }
      viewRef.current = view
      registerCmView(SOURCE_VIEW_KEY, view)

      // clear suppression flag after the current microtask — by this point
      // codemirror has finished dispatching its internal updates from setState().
      queueMicrotask(() => {
        isSwappingContentRef.current = false
      })

      // restore selection
      const sel = initialSelectionRef.current
      if (sel) {
        const { anchor, head } = lspSelectionToCm(view.state.doc, sel)
        view.dispatch({
          selection: EditorSelection.create([EditorSelection.range(anchor, head)]),
        })
      }

      view.focus()

      // notify search machine so it can retry a pending search
      const searchActor = store.get(searchActorAtom)
      if (searchActor) searchActor.send({ type: "search.content.change" })

      // load non-essential extensions (search, diff gutter visuals) after first paint
      if (deferredIdleRef.current != null) {
        cancelIdleCallback(deferredIdleRef.current)
      }
      const deferred = result.deferredExtensions
      deferredIdleRef.current = requestIdleCallback(() => {
        deferredIdleRef.current = null
        const v = viewRef.current
        if (!v) return
        v.dispatch({
          effects: deferredCompartment.current.reconfigure(deferred),
        })
      })
    }

    // sync path: language already in cache (common case after first open)
    if (languageExtensionRef.current != null) {
      setup(languageExtensionRef.current)
    } else {
      // async path: first open of this language — load then setup
      void (async () => {
        const langExt = await getLanguageSupport(language)
        setup(langExt)
      })()
    }

    // per-file cleanup: flush pending state before switching to the next file.
    // does NOT destroy the view — that only happens on component unmount.
    // IMPORTANT: can't use flushPendingWork() here because debouncedOnChange reads
    // editorIdRef.current, which has already been updated to the NEW file during render.
    // instead, cancel the debounce and persist directly with the closure-captured editorId.
    return () => {
      isCancelled = true
      if (deferredIdleRef.current != null) {
        cancelIdleCallback(deferredIdleRef.current)
        deferredIdleRef.current = null
      }

      const hasPendingChange = debouncedOnChange.isScheduled()
      debouncedOnChange.cancel()
      debouncedSelection.cancel()
      debouncedAutosave.cancel()

      if (hasPendingChange) {
        const view = viewRef.current
        if (view) {
          const text = view.state.doc.toString()
          const sel = view.state.selection.main
          const lspSel = cmSelectionToLsp(view.state, sel.anchor, sel.head)

          fileMachineSend({
            type: "editor.state.update",
            editorState: {
              id: editorId, // closure-captured OLD value (correct file)
              state: Schema.decodeUnknownSync(JsonValue)(text),
              selection: lspSel,
              view_kind: "source",
            },
          })
        }
      }

      if (autosaveEnabledRef.current && isDirtyRef.current) {
        // use closure-captured filePath/sendFileState (not refs) so we
        // autosave the OLD file, not the NEW one that refs already point to.
        const view = viewRef.current
        if (view) {
          const content = view.state.doc.toString()
          const cid = fnv1a64Hex(content)
          addPendingSave(filePath, cid)
          sendFileState({
            type: "file.save",
            content,
            viewKind: "source",
          })
        }
      }
    }
  }, [filePath, code, language]) // eslint-disable-line react-hooks/exhaustive-deps

  // component unmount: destroy the pooled view entirely
  React.useEffect(() => {
    return () => {
      if (deferredIdleRef.current != null) {
        cancelIdleCallback(deferredIdleRef.current)
        deferredIdleRef.current = null
      }
      unregisterCmView(SOURCE_VIEW_KEY)
      flushPendingWork()
      destroySourceView()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // handle theme changes dynamically via compartment reconfigure
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
