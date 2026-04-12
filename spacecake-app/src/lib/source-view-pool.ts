import { type EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

/** module-level singleton EditorView for source mode. survives across file navigations. */
let sourceView: EditorView | null = null

/** get the current source view, or null if not yet created. */
export function getSourceView(): EditorView | null {
  return sourceView
}

/**
 * create the source view on first call. on subsequent calls with a different
 * parent, reparent the existing view's DOM. always sets state via setState().
 */
export function initSourceView(parent: HTMLElement, initialState: EditorState): EditorView {
  if (sourceView) {
    // reparent if the DOM container changed (shouldn't normally happen —
    // would indicate a React reconciliation issue worth investigating)
    if (sourceView.dom.parentElement !== parent) {
      console.warn("source-view-pool: reparenting EditorView to a new container")
      parent.appendChild(sourceView.dom)
    }
    sourceView.setState(initialState)
    return sourceView
  }
  sourceView = new EditorView({ parent, state: initialState })
  return sourceView
}

/** swap the document/state on the existing view. throws if no view exists. */
export function recycleSourceView(newState: EditorState): void {
  if (!sourceView) throw new Error("no source view to recycle")
  sourceView.setState(newState)
}

/** full teardown — call when leaving source mode or closing workspace. */
export function destroySourceView(): void {
  sourceView?.destroy()
  sourceView = null
}
