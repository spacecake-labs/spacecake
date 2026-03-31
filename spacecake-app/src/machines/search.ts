// xstate machine for coordinating in-file search across lexical prose and
// codemirror code blocks.
//
// the machine subscribes to searchOpenAtom (via an "atomBridge" actor) and the
// lexical update listener. all other inputs (query, options, navigation) arrive
// as direct events from the SearchBar component or workspace search.
//
// search results are dispatched as side effects to the CSS Custom Highlight API
// (lexical) and CM StateEffects (codemirror).

import { closeSearchPanel } from "@codemirror/search"
import type { LexicalEditor } from "lexical"
import { $getRoot, $isDecoratorNode } from "lexical"
import { assign, fromCallback, setup } from "xstate"

import {
  searchCaseSensitiveAtom,
  searchOpenAtom,
  searchQueryAtom,
  searchRegexAtom,
  searchTargetLineAtom,
  searchWholeWordAtom,
} from "@/lib/atoms/search"
import {
  clearSearchMatchesEffect,
  scrollCmToMatch,
  setActiveMatchIndexEffect,
  setSearchMatchesEffect,
} from "@/lib/search/cm-search-extension"
import {
  findCmMatchesSmall,
  findCmMatchesStreaming,
  type CmSearchOptions,
} from "@/lib/search/cm-text-search"
import { getAllCmViews, getCmView, type CmViewEntry } from "@/lib/search/cm-view-registry"
import {
  clearSearchHighlights,
  scrollToCurrentMatch,
  updateSearchHighlights,
  type SearchMatch,
} from "@/lib/search/highlight-manager"
import { mergeMatches, type CmMatchGroup, type UnifiedMatch } from "@/lib/search/merge-matches"
import { buildTextIndex, findMatches } from "@/lib/search/text-walker"
import { store } from "@/lib/store"

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

export interface SearchMachineContext {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  lexicalMatches: SearchMatch[]
  cmMatchGroups: CmMatchGroup[]
  unifiedMatches: UnifiedMatch[]
  cmViews: CmViewEntry[]
  isSourceMode: boolean
  matchIndex: number
  matchCount: number
  targetLine: number | null
  editor: LexicalEditor
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export type SearchMachineEvent =
  | { type: "search.open" }
  | { type: "search.close" }
  | { type: "search.input.change"; query: string }
  | {
      type: "search.options.change"
      caseSensitive: boolean
      wholeWord: boolean
      regex: boolean
    }
  | { type: "search.content.change" }
  | { type: "search.navigate.to"; matchIndex: number }
  | { type: "search.target.line"; line: number }

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

export interface SearchMachineInput {
  editor: LexicalEditor
}

// ---------------------------------------------------------------------------
// atom bridge — subscribes to searchOpenAtom and the lexical update listener,
// translating changes into machine events.
// ---------------------------------------------------------------------------

const atomBridge = fromCallback<SearchMachineEvent, { editor: LexicalEditor }>(
  ({ sendBack, input }) => {
    // if search is already open when the machine starts (e.g. workspace search
    // opened search before the editor mounted), fire the initial event.
    if (store.get(searchOpenAtom)) {
      sendBack({ type: "search.open" })
    }

    const unsubOpen = store.sub(searchOpenAtom, () => {
      const open = store.get(searchOpenAtom)
      sendBack(open ? { type: "search.open" } : { type: "search.close" })
    })

    const unregisterUpdate = input.editor.registerUpdateListener(
      ({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
          sendBack({ type: "search.content.change" })
        }
      },
    )

    return () => {
      unsubOpen()
      unregisterUpdate()
    }
  },
)

// ---------------------------------------------------------------------------
// helpers — search execution and highlight dispatch
// ---------------------------------------------------------------------------

function executeSearch(ctx: SearchMachineContext): Partial<SearchMachineContext> {
  const { query, caseSensitive, wholeWord, regex, editor, targetLine } = ctx
  const options: CmSearchOptions = { caseSensitive, wholeWord, regex }
  const cmViews = getAllCmViews()

  // close any open CM built-in search panels to avoid duplicate highlights
  for (const [, cmView] of cmViews) {
    closeSearchPanel(cmView)
  }

  // determine if we're in source mode: single CM view backed by a single
  // decorator node (no prose)
  let isSourceMode = false
  if (cmViews.length === 1) {
    editor.read(() => {
      const children = $getRoot().getChildren()
      isSourceMode = children.length === 1 && $isDecoratorNode(children[0])
    })
  }

  // 1. lexical backend (prose text via DOM walker)
  let lexicalMatches: SearchMatch[] = []
  const rootElement = editor.getRootElement()
  if (rootElement && !isSourceMode) {
    const index = buildTextIndex(rootElement)
    lexicalMatches = findMatches(index, query, options)
  }

  // 2. CM backend (code blocks via document model)
  const cmGroups: CmMatchGroup[] = []
  for (const [nodeKey, cmView] of cmViews) {
    const findFn = isSourceMode ? findCmMatchesStreaming : findCmMatchesSmall
    const matches = findFn(cmView, query, options)
    if (matches.length > 0) {
      cmGroups.push({ nodeKey, matches })
    }
  }

  // 3. merge into document-ordered list
  const nodeOrder = getNodeOrder(editor)
  const unified = mergeMatches(nodeOrder, lexicalMatches, cmGroups)

  // 4. determine match index
  let matchIndex = 0
  if (targetLine !== null) {
    matchIndex = findMatchNearLine(unified, targetLine, isSourceMode, cmViews)
  }

  return {
    lexicalMatches,
    cmMatchGroups: cmGroups,
    unifiedMatches: unified,
    cmViews,
    isSourceMode,
    matchIndex,
    matchCount: unified.length,
    // preserve targetLine if no results — the editor may still be loading,
    // and the next search (triggered by search.content.change) needs it.
    // it gets cleared in HasResults.entry once we successfully navigate.
    targetLine: unified.length > 0 ? null : targetLine,
  }
}

function getNodeOrder(editor: LexicalEditor): string[] {
  const keys: string[] = []
  editor.read(() => {
    const root = $getRoot()
    for (const child of root.getChildren()) {
      keys.push(child.getKey())
    }
  })
  return keys
}

function findMatchNearLine(
  unified: UnifiedMatch[],
  targetLine: number,
  isSourceMode: boolean,
  cmViews: CmViewEntry[],
): number {
  if (unified.length === 0) return 0

  // for source mode, convert line number to CM doc offset and find nearest match
  if (isSourceMode && cmViews.length > 0) {
    const [, cmView] = cmViews[0]
    const doc = cmView.state.doc
    const line = Math.min(targetLine, doc.lines)
    const targetOffset = doc.line(line).from

    let bestIndex = 0
    let bestDist = Infinity
    for (let i = 0; i < unified.length; i++) {
      const match = unified[i]
      if (match.kind === "cm") {
        const dist = Math.abs(match.from - targetOffset)
        if (dist < bestDist) {
          bestDist = dist
          bestIndex = i
        }
      }
    }
    return bestIndex
  }

  // for rich mode, jump to the first match
  return 0
}

function dispatchHighlightsToBackends(ctx: SearchMachineContext): void {
  updateLexicalHighlights(ctx.lexicalMatches, ctx.unifiedMatches, ctx.matchIndex)
  dispatchCmHighlights(ctx.cmMatchGroups, ctx.unifiedMatches, ctx.matchIndex, ctx.cmViews)
}

function updateLexicalHighlights(
  lexicalMatches: SearchMatch[],
  unified: UnifiedMatch[],
  activeUnifiedIndex: number,
): void {
  if (lexicalMatches.length === 0) {
    clearSearchHighlights()
    return
  }

  const activeMatch = unified[activeUnifiedIndex]
  const activeLexicalIndex = activeMatch?.kind === "lexical" ? activeMatch.index : -1
  updateSearchHighlights(lexicalMatches, activeLexicalIndex)
}

function dispatchCmHighlights(
  cmGroups: CmMatchGroup[],
  unified: UnifiedMatch[],
  activeUnifiedIndex: number,
  cmViews: CmViewEntry[],
): void {
  const activeMatch = unified[activeUnifiedIndex]
  const activeCmNodeKey = activeMatch?.kind === "cm" ? activeMatch.nodeKey : null
  const activeCmFrom = activeMatch?.kind === "cm" ? activeMatch.from : -1

  const cmGroupsByKey = new Map(cmGroups.map((g) => [g.nodeKey, g]))

  for (const [nodeKey, cmView] of cmViews) {
    const group = cmGroupsByKey.get(nodeKey)
    if (!group || group.matches.length === 0) {
      cmView.dispatch({ effects: clearSearchMatchesEffect.of(undefined) })
      continue
    }

    let activeIndex = -1
    if (nodeKey === activeCmNodeKey) {
      activeIndex = group.matches.findIndex((m) => m.from === activeCmFrom)
    }

    cmView.dispatch({
      effects: setSearchMatchesEffect.of({
        ranges: group.matches,
        activeIndex,
      }),
    })
  }
}

function navigateToMatch(ctx: SearchMachineContext): void {
  const match = ctx.unifiedMatches[ctx.matchIndex]
  if (!match) return

  if (match.kind === "lexical") {
    try {
      const scrollContainer = ctx.editor.getRootElement() ?? undefined
      scrollToCurrentMatch(ctx.lexicalMatches, match.index, scrollContainer)
    } catch {
      // scrolling may fail in non-browser environments (jsdom)
    }
  } else {
    const cmView = getCmView(match.nodeKey)
    if (cmView) {
      scrollCmToMatch(cmView, match.from, match.to)
      cmView.dispatch({
        effects: setActiveMatchIndexEffect.of(
          ctx.cmMatchGroups
            .find((g) => g.nodeKey === match.nodeKey)
            ?.matches.findIndex((m) => m.from === match.from) ?? -1,
        ),
      })
    }
  }
}

function clearAllHighlights(ctx: SearchMachineContext): void {
  clearSearchHighlights()
  // use cached views if available, fall back to registry
  const views = ctx.cmViews.length > 0 ? ctx.cmViews : getAllCmViews()
  for (const [, cmView] of views) {
    cmView.dispatch({ effects: clearSearchMatchesEffect.of(undefined) })
    closeSearchPanel(cmView)
  }
}

// ---------------------------------------------------------------------------
// machine definition
// ---------------------------------------------------------------------------

const emptyResults: Partial<SearchMachineContext> = {
  lexicalMatches: [],
  cmMatchGroups: [],
  unifiedMatches: [],
  cmViews: [],
  isSourceMode: false,
  matchIndex: 0,
  matchCount: 0,
}

export const searchMachine = setup({
  types: {
    context: {} as SearchMachineContext,
    events: {} as SearchMachineEvent,
    input: {} as SearchMachineInput,
  },
  actions: {
    runSearch: assign(({ context }) => executeSearch(context)),

    dispatchHighlights: ({ context }) => dispatchHighlightsToBackends(context),

    navigate: ({ context }) => navigateToMatch(context),

    clearHighlights: ({ context }) => clearAllHighlights(context),

    consumeTargetLine: () => {
      store.set(searchTargetLineAtom, null)
    },

    // read current values from jotai atoms on open.
    // this picks up the query/options/targetLine set by workspace search
    // or persisted from a previous session.
    readAtoms: assign(() => ({
      query: store.get(searchQueryAtom),
      caseSensitive: store.get(searchCaseSensitiveAtom),
      wholeWord: store.get(searchWholeWordAtom),
      regex: store.get(searchRegexAtom),
      targetLine: store.get(searchTargetLineAtom),
    })),

    clearResults: assign(() => emptyResults),
  },
  guards: {
    hasQuery: ({ context }) => context.query.length > 0,
    hasResults: ({ context }) => context.unifiedMatches.length > 0,
    hasTargetLine: ({ context }) => context.targetLine !== null,
    indexChanged: ({ context, event }) => {
      if (event.type !== "search.navigate.to") return false
      return event.matchIndex !== context.matchIndex
    },
    eventQueryNonEmpty: ({ event }) => {
      if (event.type !== "search.input.change") return false
      return event.query.length > 0
    },
  },
  actors: {
    atomBridge,
  },
  delays: {
    DEBOUNCE_MS,
  },
}).createMachine({
  id: "search",
  initial: "Closed",
  context: ({ input }) => ({
    query: "",
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    lexicalMatches: [],
    cmMatchGroups: [],
    unifiedMatches: [],
    cmViews: [],
    isSourceMode: false,
    matchIndex: 0,
    matchCount: 0,
    targetLine: null,
    editor: input.editor,
  }),
  // the atom bridge runs for the entire lifetime of the machine,
  // translating searchOpenAtom changes and lexical updates into events.
  invoke: {
    src: "atomBridge",
    input: ({ context }) => ({ editor: context.editor }),
  },
  states: {
    Closed: {
      entry: ["clearHighlights", "clearResults"],
      on: {
        "search.open": "Open",
      },
    },
    Open: {
      entry: ["readAtoms"],
      initial: "Evaluating",
      on: {
        "search.close": "Closed",
      },
      states: {
        Evaluating: {
          always: [{ guard: "hasQuery", target: "Debouncing" }, { target: "Empty" }],
        },
        Empty: {
          entry: ["clearHighlights", "clearResults"],
          on: {
            "search.input.change": {
              target: "Evaluating",
              actions: assign({ query: ({ event }) => event.query }),
            },
            "search.target.line": {
              target: "Evaluating",
              actions: assign({ targetLine: ({ event }) => event.line }),
            },
            "search.options.change": {
              target: "Evaluating",
              actions: assign({
                caseSensitive: ({ event }) => event.caseSensitive,
                wholeWord: ({ event }) => event.wholeWord,
                regex: ({ event }) => event.regex,
              }),
            },
            "search.content.change": {
              target: "Evaluating",
            },
          },
        },
        Debouncing: {
          on: {
            "search.input.change": {
              target: "Debouncing",
              reenter: true,
              actions: assign({ query: ({ event }) => event.query }),
            },
            "search.options.change": {
              target: "Debouncing",
              reenter: true,
              actions: assign({
                caseSensitive: ({ event }) => event.caseSensitive,
                wholeWord: ({ event }) => event.wholeWord,
                regex: ({ event }) => event.regex,
              }),
            },
            "search.content.change": {
              target: "Debouncing",
              reenter: true,
            },
            "search.target.line": {
              target: "Debouncing",
              reenter: true,
              actions: assign({ targetLine: ({ event }) => event.line }),
            },
          },
          // skip debounce when workspace search hands off with a target line
          always: [{ guard: "hasTargetLine", target: "Searching" }],
          after: {
            DEBOUNCE_MS: [
              // if query was cleared during debounce, go to Empty instead
              { guard: "hasQuery", target: "Searching" },
              { target: "Empty" },
            ],
          },
        },
        Searching: {
          entry: ["runSearch"],
          always: [
            {
              guard: "hasResults",
              target: "HasResults",
            },
            { target: "Empty" },
          ],
        },
        HasResults: {
          entry: ["dispatchHighlights", "navigate", "consumeTargetLine"],
          on: {
            "search.input.change": [
              {
                guard: "eventQueryNonEmpty",
                target: "Debouncing",
                actions: assign({ query: ({ event }) => event.query }),
              },
              {
                target: "Empty",
                actions: assign({ query: ({ event }) => event.query }),
              },
            ],
            "search.options.change": {
              target: "Debouncing",
              actions: assign({
                caseSensitive: ({ event }) => event.caseSensitive,
                wholeWord: ({ event }) => event.wholeWord,
                regex: ({ event }) => event.regex,
              }),
            },
            "search.content.change": {
              target: "Debouncing",
            },
            "search.navigate.to": {
              guard: "indexChanged",
              actions: [
                assign(({ context, event }) => ({
                  matchIndex: Math.max(0, Math.min(event.matchIndex, context.matchCount - 1)),
                })),
                "dispatchHighlights",
                "navigate",
              ],
            },
            "search.target.line": {
              actions: [
                assign(({ context, event }) => ({
                  matchIndex: findMatchNearLine(
                    context.unifiedMatches,
                    event.line,
                    context.isSourceMode,
                    context.cmViews,
                  ),
                  targetLine: null,
                })),
                "dispatchHighlights",
                "navigate",
                "consumeTargetLine",
              ],
            },
          },
        },
      },
    },
  },
})

export type SearchMachine = typeof searchMachine
