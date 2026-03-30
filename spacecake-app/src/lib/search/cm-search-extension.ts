// CodeMirror extension for external search highlighting.
// follows the blame-annotation.ts pattern: StateEffect + StateField + ViewPlugin.
//
// the coordinator (SearchPlugin) pushes match ranges via StateEffect.
// the ViewPlugin builds Decoration.mark() only for visible ranges (viewport-scoped).
// on docChanged, the extension re-runs search locally and notifies the coordinator
// via a callback so match counts stay in sync.

import { Facet, type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"

import type { CmMatch, CmSearchOptions } from "@/lib/search/cm-text-search"
import { findCmMatchesSmall, findCmMatchesStreaming } from "@/lib/search/cm-text-search"

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface CmSearchMatchData {
  ranges: CmMatch[]
  activeIndex: number
}

export interface CmSearchQuery {
  query: string
  options: CmSearchOptions
}

/**
 * callback signature for when a CM instance's match count changes.
 * the coordinator subscribes to this to re-merge the unified match list.
 */
export type CmSearchCountCallback = (nodeKey: string, count: number) => void

// ---------------------------------------------------------------------------
// state effects
// ---------------------------------------------------------------------------

/** push match ranges + active index from the coordinator. */
export const setSearchMatchesEffect = StateEffect.define<CmSearchMatchData>()

/** clear all search matches. */
export const clearSearchMatchesEffect = StateEffect.define<void>()

/** update which match is active (for current-match highlighting). */
export const setActiveMatchIndexEffect = StateEffect.define<number>()

// ---------------------------------------------------------------------------
// facets for configuration
// ---------------------------------------------------------------------------

/** the current search query, pushed from the coordinator. */
export const searchQueryFacet = Facet.define<CmSearchQuery, CmSearchQuery>({
  combine: (values) => values[0] ?? { query: "", options: {} },
})

/** whether this CM instance is in source mode (use streaming search). */
export const isSourceModeFacet = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
})

/** callback for notifying the coordinator of match count changes. */
export const searchCountCallbackFacet = Facet.define<CmSearchCountCallback, CmSearchCountCallback>({
  combine: (values) => values[0] ?? (() => {}),
})

/** the Lexical node key for this CM instance. */
export const cmNodeKeyFacet = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
})

// ---------------------------------------------------------------------------
// state field — holds match data
// ---------------------------------------------------------------------------

const emptyMatchData: CmSearchMatchData = { ranges: [], activeIndex: -1 }

const searchMatchField = StateField.define<CmSearchMatchData>({
  create: () => emptyMatchData,
  update(state, tr) {
    for (const e of tr.effects) {
      if (e.is(setSearchMatchesEffect)) return e.value
      if (e.is(clearSearchMatchesEffect)) return emptyMatchData
      if (e.is(setActiveMatchIndexEffect)) return { ...state, activeIndex: e.value }
    }
    return state
  },
})

// ---------------------------------------------------------------------------
// decoration marks
// ---------------------------------------------------------------------------

const matchMark = Decoration.mark({ class: "cm-search-match" })
const activeMatchMark = Decoration.mark({ class: "cm-search-match cm-search-match-active" })

// ---------------------------------------------------------------------------
// view plugin — viewport-scoped highlighting
// ---------------------------------------------------------------------------

class SearchHighlightPlugin implements PluginValue {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.build(view)
  }

  update(update: ViewUpdate) {
    const oldData = update.startState.field(searchMatchField)
    const newData = update.state.field(searchMatchField)

    if (oldData !== newData || update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view)
    }
  }

  private build(view: EditorView): DecorationSet {
    const { ranges, activeIndex } = view.state.field(searchMatchField)
    if (ranges.length === 0) return Decoration.none

    const builder = new RangeSetBuilder<Decoration>()
    const { visibleRanges } = view

    // iterate visible ranges, merging adjacent ones within a 500-char margin
    // (following CM's own searchHighlighter pattern)
    for (let i = 0; i < visibleRanges.length; i++) {
      let { from: vFrom, to: vTo } = visibleRanges[i]
      while (i < visibleRanges.length - 1 && vTo > visibleRanges[i + 1].from - 500) {
        vTo = visibleRanges[++i].to
      }

      for (let j = 0; j < ranges.length; j++) {
        const range = ranges[j]
        if (range.to <= vFrom) continue
        if (range.from >= vTo) break // ranges are sorted, can stop early
        // clamp to visible range for the builder (must be in order)
        const from = Math.max(range.from, vFrom)
        const to = Math.min(range.to, vTo)
        builder.add(from, to, j === activeIndex ? activeMatchMark : matchMark)
      }
    }

    return builder.finish()
  }
}

const searchHighlighter = ViewPlugin.fromClass(SearchHighlightPlugin, {
  decorations: (v) => v.decorations,
})

// ---------------------------------------------------------------------------
// self-search on doc change — keeps matches in sync with edits
// ---------------------------------------------------------------------------

const selfSearchOnDocChange = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return

  const { query, options } = update.state.facet(searchQueryFacet)
  if (!query) return

  const isSource = update.state.facet(isSourceModeFacet)
  const findMatches = isSource ? findCmMatchesStreaming : findCmMatchesSmall
  const matches = findMatches(update.view, query, options)

  update.view.dispatch({
    effects: setSearchMatchesEffect.of({ ranges: matches, activeIndex: -1 }),
  })

  // notify the coordinator of the new match count
  const callback = update.state.facet(searchCountCallbackFacet)
  const nodeKey = update.state.facet(cmNodeKeyFacet)
  callback(nodeKey, matches.length)
})

// ---------------------------------------------------------------------------
// scroll helper
// ---------------------------------------------------------------------------

/** scroll a CM instance to a specific match position. */
export function scrollCmToMatch(view: EditorView, from: number, to: number): void {
  view.dispatch({
    effects: EditorView.scrollIntoView(from, { y: "center" }),
    selection: { anchor: from, head: to },
  })
}

// ---------------------------------------------------------------------------
// theme
// ---------------------------------------------------------------------------

const searchTheme = EditorView.baseTheme({
  "&light .cm-search-match": {
    backgroundColor: "oklch(95% 0.052 163.051)",
    color: "oklch(43.2% 0.095 166.913)",
    borderRadius: "2px",
  },
  "&light .cm-search-match-active": {
    backgroundColor: "oklch(90.5% 0.093 164.15)",
    color: "oklch(43.2% 0.095 166.913)",
  },
  "&dark .cm-search-match": {
    backgroundColor: "oklch(69.6% 0.17 162.48 / 20%)",
    color: "oklch(84.5% 0.143 164.978)",
    borderRadius: "2px",
  },
  "&dark .cm-search-match-active": {
    backgroundColor: "oklch(69.6% 0.17 162.48 / 40%)",
    color: "oklch(84.5% 0.143 164.978)",
  },
})

// ---------------------------------------------------------------------------
// public extension bundle
// ---------------------------------------------------------------------------

export function externalSearchExtension(): Extension {
  return [searchMatchField, searchHighlighter, selfSearchOnDocChange, searchTheme]
}
