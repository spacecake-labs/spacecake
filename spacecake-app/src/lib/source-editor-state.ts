import { indentWithTab } from "@codemirror/commands"
import { search } from "@codemirror/search"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, type KeyBinding, keymap, lineNumbers } from "@codemirror/view"
import { basicSetup } from "codemirror"

import { focusedActiveLineTheme, foldPlaceholderTheme } from "@/components/editor/codemirror-shared"
import { emptyBlameAnnotation } from "@/components/editor/plugins/blame-annotation"
import {
  diffGutterStaticExtensions,
  emptyDiffGutterData,
} from "@/components/editor/plugins/diff-gutter"
import { githubDark, githubLight } from "@/components/editor/themes"
import { externalSearchExtension } from "@/lib/search/cm-search-extension"

export interface SourceEditorCompartments {
  theme: Compartment
  language: Compartment
  blame: Compartment
  diffGutter: Compartment
  /** starts empty; populated after first paint via requestIdleCallback */
  deferred: Compartment
}

export interface SourceEditorStateResult {
  state: EditorState
  compartments: SourceEditorCompartments
  /** non-essential extensions to load after first paint */
  deferredExtensions: Extension
}

/** build a codemirror EditorState for source mode. pure computation — no DOM needed. */
export function buildSourceEditorState(opts: {
  code: string
  languageExtension: Extension | null
  theme: "dark" | "light"
  updateListener: Extension
  saveKeymap: KeyBinding[]
}): SourceEditorStateResult {
  const compartments: SourceEditorCompartments = {
    theme: new Compartment(),
    language: new Compartment(),
    blame: new Compartment(),
    diffGutter: new Compartment(),
    deferred: new Compartment(),
  }

  // essential extensions — needed for first paint
  const extensions: Extension[] = [
    basicSetup,
    lineNumbers(),
    keymap.of([indentWithTab, ...opts.saveKeymap]),
    EditorView.lineWrapping,
    // fill parent height, scroll internally, extend gutter for short files
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": { overflow: "auto" },
      ".cm-content, .cm-gutter": { minHeight: "100%" },
    }),
    compartments.theme.of(opts.theme === "dark" ? githubDark : githubLight),
    compartments.language.of(opts.languageExtension ?? []),
    focusedActiveLineTheme,
    foldPlaceholderTheme,
    compartments.blame.of(emptyBlameAnnotation()),
    compartments.diffGutter.of(emptyDiffGutterData()),
    // diff gutter structure (field + gutter column + theme) loaded eagerly so the
    // gutter column is present from first paint and doesn't cause a layout shift.
    // the field starts with an empty RangeSet — negligible cost.
    diffGutterStaticExtensions,
    opts.updateListener,
    // placeholder for deferred extensions (search)
    compartments.deferred.of([]),
  ]

  // non-essential extensions — loaded after first paint via requestIdleCallback
  const deferredExtensions: Extension = [search({ top: true }), externalSearchExtension()]

  return {
    state: EditorState.create({ doc: opts.code, extensions }),
    compartments,
    deferredExtensions,
  }
}
