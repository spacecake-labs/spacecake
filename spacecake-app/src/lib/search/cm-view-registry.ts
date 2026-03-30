// registry for CodeMirror EditorView instances, keyed by Lexical node key.
// uses WeakRef so destroyed views can be garbage collected even if
// the explicit unregister call is missed (e.g. error boundary, strict mode).

import type { EditorView } from "@codemirror/view"

export type CmViewEntry = [string, EditorView]

const registry = new Map<string, WeakRef<EditorView>>()
const releases = new FinalizationRegistry<string>((nodeKey) => {
  registry.delete(nodeKey)
})

/** register a CM EditorView for a given Lexical node key. */
export function registerCmView(nodeKey: string, view: EditorView): void {
  registry.set(nodeKey, new WeakRef(view))
  releases.register(view, nodeKey)
}

/** unregister a CM EditorView (call on unmount). */
export function unregisterCmView(nodeKey: string): void {
  registry.delete(nodeKey)
}

/** get a single CM EditorView by node key, or undefined if gone. */
export function getCmView(nodeKey: string): EditorView | undefined {
  const ref = registry.get(nodeKey)
  if (!ref) return undefined
  const view = ref.deref()
  if (!view) {
    registry.delete(nodeKey)
    return undefined
  }
  return view
}

/** get all live CM EditorViews. prunes stale WeakRefs. */
export function getAllCmViews(): CmViewEntry[] {
  const result: CmViewEntry[] = []
  for (const [key, ref] of registry) {
    const view = ref.deref()
    if (view) {
      result.push([key, view])
    } else {
      registry.delete(key)
    }
  }
  return result
}

/** clear all entries (for testing). */
export function clearCmViewRegistry(): void {
  registry.clear()
}
