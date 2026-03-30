// walks the DOM to extract searchable text and find matches for editor search.
// skips decorator nodes (codemirror, mermaid) marked with data-lexical-decorator="true".

export interface TextSegment {
  node: Text
  start: number
  length: number
}

export interface TextIndex {
  fullText: string
  segments: TextSegment[]
}

export interface MatchRange {
  node: Text
  startOffset: number
  endOffset: number
}

export interface Match {
  ranges: MatchRange[]
}

export interface FindMatchesOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

// builds a text index from a root element by walking all text nodes,
// skipping entire decorator subtrees via FILTER_REJECT.
export function buildTextIndex(rootElement: HTMLElement): TextIndex {
  const segments: TextSegment[] = []
  const parts: string[] = []
  let offset = 0

  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_ALL, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).getAttribute("data-lexical-decorator") === "true"
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
      }
      return node.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })

  let textNode = walker.nextNode() as Text | null
  while (textNode) {
    const text = textNode.textContent ?? ""
    if (text.length > 0) {
      segments.push({
        node: textNode,
        start: offset,
        length: text.length,
      })
      parts.push(text)
      offset += text.length
    }
    textNode = walker.nextNode() as Text | null
  }

  return { fullText: parts.join(""), segments }
}

// escapes a string for use in a regular expression
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// binary search for the first segment that could overlap with matchStart.
// returns the index of the segment whose range includes or follows matchStart.
function findSegmentIndex(segments: TextSegment[], offset: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const seg = segments[mid]
    if (offset < seg.start) {
      hi = mid - 1
    } else if (offset >= seg.start + seg.length) {
      lo = mid + 1
    } else {
      return mid
    }
  }
  return lo
}

// maps a match's offset range in fullText back to one or more DOM text node ranges.
// a single match may span multiple text nodes.
// uses binary search to find the first overlapping segment: O(log n + k)
// where k is the number of segments the match spans (usually 1).
function mapMatchToRanges(
  segments: TextSegment[],
  matchStart: number,
  matchEnd: number,
): MatchRange[] {
  const ranges: MatchRange[] = []
  let i = findSegmentIndex(segments, matchStart)

  while (i < segments.length) {
    const segment = segments[i]
    const segStart = segment.start
    const segEnd = segment.start + segment.length

    if (segStart >= matchEnd) break

    const overlapStart = Math.max(matchStart, segStart)
    const overlapEnd = Math.min(matchEnd, segEnd)

    ranges.push({
      node: segment.node,
      startOffset: overlapStart - segStart,
      endOffset: overlapEnd - segStart,
    })
    i++
  }

  return ranges
}

const MAX_LEXICAL_MATCHES = 10_000

// finds all matches of a query within a text index and returns their DOM ranges.
// capped at 10,000 matches to bound downstream allocations (CSS Highlights, etc.).
export function findMatches(
  index: TextIndex,
  query: string,
  options: FindMatchesOptions = {},
): Match[] {
  if (!query) {
    return []
  }

  const { caseSensitive = false, wholeWord = false, regex: useRegex = false } = options

  let pattern: RegExp
  try {
    const flags = caseSensitive ? "g" : "gi"
    let source = useRegex ? query : escapeRegex(query)
    if (wholeWord) {
      if (!/\B/.test(source.charAt(0))) source = "\\b" + source
      if (!/\B/.test(source.charAt(source.length - 1))) source = source + "\\b"
    }
    pattern = new RegExp(source, flags)
  } catch {
    // invalid regex pattern
    return []
  }

  const matches: Match[] = []
  let result: RegExpExecArray | null

  while ((result = pattern.exec(index.fullText)) !== null) {
    const matchStart = result.index
    const matchEnd = matchStart + result[0].length

    // skip zero-length matches to avoid infinite loops
    if (result[0].length === 0) {
      pattern.lastIndex++
      continue
    }

    const ranges = mapMatchToRanges(index.segments, matchStart, matchEnd)
    if (ranges.length > 0) {
      matches.push({ ranges })
    }

    if (matches.length >= MAX_LEXICAL_MATCHES) break
  }

  return matches
}
