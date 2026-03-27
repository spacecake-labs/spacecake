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

// maps a match's offset range in fullText back to one or more DOM text node ranges.
// a single match may span multiple text nodes.
function mapMatchToRanges(
  segments: TextSegment[],
  matchStart: number,
  matchEnd: number,
): MatchRange[] {
  const ranges: MatchRange[] = []

  for (const segment of segments) {
    const segStart = segment.start
    const segEnd = segment.start + segment.length

    // skip segments entirely before or after the match
    if (segEnd <= matchStart || segStart >= matchEnd) {
      continue
    }

    // calculate the overlap between this segment and the match
    const overlapStart = Math.max(matchStart, segStart)
    const overlapEnd = Math.min(matchEnd, segEnd)

    ranges.push({
      node: segment.node,
      startOffset: overlapStart - segStart,
      endOffset: overlapEnd - segStart,
    })
  }

  return ranges
}

// finds all matches of a query within a text index and returns their DOM ranges.
export function findMatches(
  index: TextIndex,
  query: string,
  options: FindMatchesOptions = {},
): Match[] {
  if (!query) {
    return []
  }

  const { caseSensitive = false, regex: useRegex = false } = options

  let pattern: RegExp
  try {
    const flags = caseSensitive ? "g" : "gi"
    const source = useRegex ? query : escapeRegex(query)
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
  }

  return matches
}
