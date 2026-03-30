// search a CodeMirror document model without materializing the full string.
// uses SearchCursor (streams the rope) for literal search,
// RegExpCursor for regex search. both avoid full-document string allocation.

import { RegExpCursor, SearchCursor } from "@codemirror/search"
import type { EditorView } from "@codemirror/view"

export interface CmSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export interface CmMatch {
  from: number
  to: number
}

const DEFAULT_MAX_MATCHES_LARGE = 10_000
const DEFAULT_MAX_MATCHES_SMALL = 1_000

// escapes a string for use in a regular expression
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * search a CM document using SearchCursor/RegExpCursor (streaming, zero allocation).
 * preferred for source mode where the document can be very large.
 */
export function findCmMatchesStreaming(
  view: EditorView,
  query: string,
  options: CmSearchOptions = {},
  maxMatches = DEFAULT_MAX_MATCHES_LARGE,
): CmMatch[] {
  if (!query) return []

  const { caseSensitive = false, regex: useRegex = false, wholeWord = false } = options
  const doc = view.state.doc

  if (useRegex) {
    return findWithRegExpCursor(doc, query, { caseSensitive, wholeWord }, maxMatches)
  }

  // literal search via SearchCursor
  const normalize = caseSensitive ? undefined : (s: string) => s.toLowerCase()
  const cursor = new SearchCursor(doc, query, 0, doc.length, normalize)

  const matches: CmMatch[] = []
  while (!cursor.next().done) {
    const { from, to } = cursor.value
    if (wholeWord && !isWholeWordMatchCm(doc, from, to)) {
      continue
    }
    matches.push({ from, to })
    if (matches.length >= maxMatches) break
  }
  return matches
}

/**
 * search a CM document using doc.toString() + regex.
 * preferred for small code blocks in rich mode where materialization is negligible.
 */
export function findCmMatchesSmall(
  view: EditorView,
  query: string,
  options: CmSearchOptions = {},
  maxMatches = DEFAULT_MAX_MATCHES_SMALL,
): CmMatch[] {
  if (!query) return []

  const { caseSensitive = false, regex: useRegex = false, wholeWord = false } = options
  const text = view.state.doc.toString()

  let pattern: RegExp
  try {
    const flags = caseSensitive ? "g" : "gi"
    let source = useRegex ? query : escapeRegex(query)
    if (wholeWord) {
      source = `\\b${source}\\b`
    }
    pattern = new RegExp(source, flags)
  } catch {
    return []
  }

  const matches: CmMatch[] = []
  let result: RegExpExecArray | null
  while ((result = pattern.exec(text)) !== null) {
    if (result[0].length === 0) {
      pattern.lastIndex++
      continue
    }
    matches.push({ from: result.index, to: result.index + result[0].length })
    if (matches.length >= maxMatches) break
  }
  return matches
}

// helper: use RegExpCursor for streaming regex search
function findWithRegExpCursor(
  doc: import("@codemirror/state").Text,
  query: string,
  options: { caseSensitive: boolean; wholeWord: boolean },
  maxMatches: number,
): CmMatch[] {
  let source = query
  if (options.wholeWord) {
    source = `\\b${source}\\b`
  }

  let cursor: RegExpCursor
  try {
    cursor = new RegExpCursor(doc, source, { ignoreCase: !options.caseSensitive }, 0, doc.length)
  } catch {
    return []
  }

  const matches: CmMatch[] = []
  while (!cursor.next().done) {
    matches.push({ from: cursor.value.from, to: cursor.value.to })
    if (matches.length >= maxMatches) break
  }
  return matches
}

// check if a match at [from, to) is a whole-word match using the CM rope.
// reads only the boundary characters via sliceString — O(log n) per call,
// avoiding full-document materialization.
function isWholeWordMatchCm(
  doc: import("@codemirror/state").Text,
  from: number,
  to: number,
): boolean {
  const wordChar = /\w/
  if (from > 0) {
    const before = doc.sliceString(from - 1, from)
    const at = doc.sliceString(from, from + 1)
    if (wordChar.test(before) && wordChar.test(at)) return false
  }
  if (to < doc.length) {
    const prev = doc.sliceString(to - 1, to)
    const after = doc.sliceString(to, to + 1)
    if (wordChar.test(prev) && wordChar.test(after)) return false
  }
  return true
}
