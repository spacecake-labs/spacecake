import { describe, expect, it } from "vitest"

import type { SearchMatch } from "@/lib/search/highlight-manager"
import { mergeMatches, type CmMatchGroup } from "@/lib/search/merge-matches"

// helper to create a dummy SearchMatch (we only need the index in the unified list)
function dummyLexicalMatches(count: number): SearchMatch[] {
  return Array.from({ length: count }, () => ({ ranges: [] }))
}

describe("mergeMatches", () => {
  it("returns empty array when no matches", () => {
    const result = mergeMatches(["n1", "n2"], [], [])
    expect(result).toEqual([])
  })

  it("returns only lexical matches when no code blocks", () => {
    const lexical = dummyLexicalMatches(3)
    const result = mergeMatches(["n1", "n2", "n3"], lexical, [])
    expect(result).toEqual([
      { kind: "lexical", index: 0 },
      { kind: "lexical", index: 1 },
      { kind: "lexical", index: 2 },
    ])
  })

  it("returns only CM matches when no lexical matches", () => {
    const cmGroups: CmMatchGroup[] = [
      {
        nodeKey: "cb1",
        matches: [
          { from: 0, to: 5 },
          { from: 10, to: 15 },
        ],
      },
    ]
    const result = mergeMatches(["n1", "cb1", "n2"], [], cmGroups)
    expect(result).toEqual([
      { kind: "cm", nodeKey: "cb1", from: 0, to: 5 },
      { kind: "cm", nodeKey: "cb1", from: 10, to: 15 },
    ])
  })

  it("interleaves lexical and CM matches in document order", () => {
    const lexical = dummyLexicalMatches(2)
    const cmGroups: CmMatchGroup[] = [{ nodeKey: "cb1", matches: [{ from: 0, to: 3 }] }]
    // document order: prose node, code block, prose node
    const result = mergeMatches(["n1", "cb1", "n2"], lexical, cmGroups)

    // first lexical match should come before the CM match,
    // second lexical match should come after
    expect(result[0]).toEqual({ kind: "lexical", index: 0 })
    expect(result[1]).toEqual({ kind: "cm", nodeKey: "cb1", from: 0, to: 3 })
    expect(result[2]).toEqual({ kind: "lexical", index: 1 })
  })

  it("handles multiple code blocks", () => {
    const lexical = dummyLexicalMatches(3)
    const cmGroups: CmMatchGroup[] = [
      { nodeKey: "cb1", matches: [{ from: 0, to: 5 }] },
      { nodeKey: "cb2", matches: [{ from: 0, to: 3 }] },
    ]
    // prose, code, prose, code, prose
    const result = mergeMatches(["n1", "cb1", "n2", "cb2", "n3"], lexical, cmGroups)

    expect(result).toHaveLength(5)
    expect(result[0].kind).toBe("lexical")
    expect(result[1].kind).toBe("cm")
    expect(result[2].kind).toBe("lexical")
    expect(result[3].kind).toBe("cm")
    expect(result[4].kind).toBe("lexical")
  })

  it("handles code block at start of document", () => {
    const lexical = dummyLexicalMatches(1)
    const cmGroups: CmMatchGroup[] = [{ nodeKey: "cb1", matches: [{ from: 0, to: 5 }] }]
    const result = mergeMatches(["cb1", "n1"], lexical, cmGroups)

    expect(result[0]).toEqual({ kind: "cm", nodeKey: "cb1", from: 0, to: 5 })
    expect(result[1]).toEqual({ kind: "lexical", index: 0 })
  })

  it("handles code block at end of document", () => {
    const lexical = dummyLexicalMatches(1)
    const cmGroups: CmMatchGroup[] = [{ nodeKey: "cb1", matches: [{ from: 0, to: 5 }] }]
    const result = mergeMatches(["n1", "cb1"], lexical, cmGroups)

    expect(result[0]).toEqual({ kind: "lexical", index: 0 })
    expect(result[1]).toEqual({ kind: "cm", nodeKey: "cb1", from: 0, to: 5 })
  })

  it("caps unified matches at 10,000", () => {
    // create a large number of lexical matches
    const lexical = dummyLexicalMatches(12_000)
    const result = mergeMatches(["n1"], lexical, [])
    expect(result).toHaveLength(10_000)
  })

  it("caps with mixed matches", () => {
    const lexical = dummyLexicalMatches(8_000)
    const cmGroups: CmMatchGroup[] = [
      {
        nodeKey: "cb1",
        matches: Array.from({ length: 5_000 }, (_, i) => ({ from: i * 10, to: i * 10 + 5 })),
      },
    ]
    const result = mergeMatches(["n1", "cb1"], lexical, cmGroups)
    expect(result).toHaveLength(10_000)
  })

  it("handles CM group with nodeKey not in nodeOrder gracefully", () => {
    const cmGroups: CmMatchGroup[] = [{ nodeKey: "unknown", matches: [{ from: 0, to: 5 }] }]
    // unknown nodeKey is not in nodeOrder — its matches won't appear
    const result = mergeMatches(["n1", "n2"], [], cmGroups)
    expect(result).toEqual([])
  })
})
