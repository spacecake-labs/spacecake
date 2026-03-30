/**
 * CSS Custom Highlight API manager for search match highlighting.
 *
 * uses the CSS Custom Highlight API (CSS.highlights) to paint two layers:
 *   - "search-match"         — all matches in the document
 *   - "search-match-current" — the currently-focused match
 *
 * the API works by registering named Highlight objects that contain DOM Range
 * instances. the browser then paints them via the ::highlight() pseudo-element
 * in CSS.
 */

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type MatchRange = {
  node: Text
  startOffset: number
  endOffset: number
}

export type SearchMatch = {
  ranges: MatchRange[]
}

// ---------------------------------------------------------------------------
// highlight names
// ---------------------------------------------------------------------------

const HIGHLIGHT_ALL = "search-match"
const HIGHLIGHT_CURRENT = "search-match-current"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** return true when the CSS Custom Highlight API is available at runtime */
function hasHighlightApi(): boolean {
  return typeof CSS !== "undefined" && CSS.highlights !== undefined
}

/** create a DOM Range from a MatchRange descriptor */
function toDomRange(mr: MatchRange): Range {
  const range = new Range()
  range.setStart(mr.node, mr.startOffset)
  range.setEnd(mr.node, mr.endOffset)
  return range
}

// ---------------------------------------------------------------------------
// cache — avoid rebuilding all DOM Ranges on every next/prev navigation.
// the "all matches" Highlight is only rebuilt when the matches array identity
// changes (new search or content edit). the "current match" highlight is
// always cheap (1-2 Range objects).
// ---------------------------------------------------------------------------

let cachedAllHighlight: Highlight | null = null
let cachedMatchesIdentity: SearchMatch[] | null = null

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * create (or replace) CSS custom highlights for all matches and the current
 * match. if matches is empty the highlights are cleared instead.
 *
 * caches the "all matches" Highlight object — only rebuilds when the matches
 * array reference changes (not on every next/prev navigation).
 */
export function updateSearchHighlights(matches: SearchMatch[], currentIndex: number): void {
  if (!hasHighlightApi()) return

  // nothing to highlight — clear and bail
  if (matches.length === 0) {
    clearSearchHighlights()
    return
  }

  // only rebuild the "all matches" highlight when matches change identity
  if (matches !== cachedMatchesIdentity) {
    const allRanges: Range[] = []
    for (const match of matches) {
      for (const mr of match.ranges) {
        allRanges.push(toDomRange(mr))
      }
    }
    cachedAllHighlight = new Highlight(...allRanges)
    cachedMatchesIdentity = matches
    CSS.highlights.set(HIGHLIGHT_ALL, cachedAllHighlight)
  }

  // always update the current-match highlight (cheap — 1-2 Range objects)
  if (currentIndex >= 0 && currentIndex < matches.length) {
    const currentRanges = matches[currentIndex].ranges.map(toDomRange)
    CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(...currentRanges))
  } else {
    CSS.highlights.delete(HIGHLIGHT_CURRENT)
  }
}

/**
 * remove both search highlight registrations from CSS.highlights.
 */
export function clearSearchHighlights(): void {
  if (!hasHighlightApi()) return

  CSS.highlights.delete(HIGHLIGHT_ALL)
  CSS.highlights.delete(HIGHLIGHT_CURRENT)
  cachedAllHighlight = null
  cachedMatchesIdentity = null
}

/**
 * scroll the viewport so the current match is visible.
 *
 * uses the bounding rect of the first range of the current match to find the
 * closest scrollable ancestor and scroll it so the match is roughly centred.
 */
export function scrollToCurrentMatch(
  matches: SearchMatch[],
  currentIndex: number,
  scrollContainer?: HTMLElement,
): void {
  if (matches.length === 0 || currentIndex < 0 || currentIndex >= matches.length) {
    return
  }

  const firstRange = matches[currentIndex].ranges[0]
  if (!firstRange) return

  const range = toDomRange(firstRange)
  const rect = range.getBoundingClientRect()

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const scrollTop =
      scrollContainer.scrollTop +
      (rect.top - containerRect.top) -
      containerRect.height / 2 +
      rect.height / 2
    const scrollLeft =
      scrollContainer.scrollLeft +
      (rect.left - containerRect.left) -
      containerRect.width / 2 +
      rect.width / 2

    scrollContainer.scrollTo({
      top: scrollTop,
      left: scrollLeft,
      behavior: "smooth",
    })
    return
  }

  // fallback: scroll using the text node's parent element (avoids mutating the DOM)
  const parent = firstRange.node.parentElement
  if (!parent) return

  parent.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
}
