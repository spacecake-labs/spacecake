// pure function to merge lexical and CodeMirror matches into a single
// document-ordered list for unified navigation.
//
// each match is tagged with its backend so the coordinator can delegate
// highlighting and scrolling to the correct system.

import type { CmMatch } from "@/lib/search/cm-text-search"
import type { SearchMatch } from "@/lib/search/highlight-manager"

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type UnifiedMatch =
  | { kind: "lexical"; index: number }
  | { kind: "cm"; nodeKey: string; from: number; to: number }

export interface CmMatchGroup {
  nodeKey: string
  matches: CmMatch[]
}

const MAX_UNIFIED_MATCHES = 10_000

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * merge lexical prose matches and CodeMirror code block matches into
 * a single document-ordered array.
 *
 * @param nodeOrder - lexical node keys in document order (from $getRoot().getChildren()
 *   or similar traversal). code block node keys appear at their document position;
 *   all other keys are treated as prose. lexical matches are interleaved at the
 *   position of the first non-codeblock node.
 * @param lexicalMatches - matches from the DOM text walker (prose only)
 * @param cmMatchGroups - matches per code block, keyed by lexical node key
 */
export function mergeMatches(
  nodeOrder: string[],
  lexicalMatches: SearchMatch[],
  cmMatchGroups: CmMatchGroup[],
): UnifiedMatch[] {
  // index CM groups by node key for O(1) lookup
  const cmByNodeKey = new Map<string, CmMatchGroup>()
  for (const group of cmMatchGroups) {
    cmByNodeKey.set(group.nodeKey, group)
  }

  const result: UnifiedMatch[] = []
  let lexicalIndex = 0

  // walk the document in node order.
  // - for code block nodes: insert their CM matches
  // - for other nodes: insert the next batch of lexical matches
  //   (lexical matches are already in DOM order which corresponds to document order)
  //
  // the key insight: lexical matches come from the DOM text walker which walks
  // the DOM in document order, skipping decorators. so lexical match[i] comes
  // before lexical match[i+1] in the document. we just need to figure out
  // where the CM matches interleave.
  //
  // approach: code block nodes appear in nodeOrder at their document position.
  // we track a "lexical slot counter" — each non-codeblock node in nodeOrder
  // represents one or more lexical matches. we don't know exactly how many
  // lexical matches correspond to each node, but we know they're in order.
  //
  // simplified strategy: emit all lexical matches first up to the first
  // code block, then CM matches for that block, then lexical matches up
  // to the next code block, etc. since the DOM text walker processes
  // nodes in document order, this interleaving is correct.
  //
  // to determine how many lexical matches precede each code block, we'd
  // need the DOM positions, which we don't have here. instead, we use a
  // simpler approach: group by node order.

  // find which nodeOrder entries are code blocks (have CM matches)
  const codeBlockPositions: Array<{ position: number; group: CmMatchGroup }> = []
  for (let i = 0; i < nodeOrder.length; i++) {
    const group = cmByNodeKey.get(nodeOrder[i])
    if (group) {
      codeBlockPositions.push({ position: i, group })
    }
  }

  if (codeBlockPositions.length === 0) {
    // no code blocks — all matches are lexical
    for (let i = 0; i < lexicalMatches.length && result.length < MAX_UNIFIED_MATCHES; i++) {
      result.push({ kind: "lexical", index: i })
    }
    return result
  }

  if (lexicalMatches.length === 0) {
    // no prose matches — all matches are CM
    for (const { group } of codeBlockPositions) {
      for (const match of group.matches) {
        if (result.length >= MAX_UNIFIED_MATCHES) return result
        result.push({ kind: "cm", nodeKey: group.nodeKey, from: match.from, to: match.to })
      }
    }
    return result
  }

  // general case: interleave based on proportional position.
  // we know there are N non-codeblock nodes and M lexical matches.
  // distribute lexical matches evenly across non-codeblock slots,
  // then interleave with CM matches at the right positions.
  const nonCodeBlockCount = nodeOrder.length - codeBlockPositions.length
  const codeBlockSet = new Set(codeBlockPositions.map((p) => p.position))

  // walk node order, emitting matches for each slot
  let codeBlockIdx = 0
  for (let nodeIdx = 0; nodeIdx < nodeOrder.length; nodeIdx++) {
    if (result.length >= MAX_UNIFIED_MATCHES) break

    if (codeBlockSet.has(nodeIdx)) {
      // this is a code block — emit its CM matches
      const group = codeBlockPositions[codeBlockIdx++].group
      for (const match of group.matches) {
        if (result.length >= MAX_UNIFIED_MATCHES) return result
        result.push({ kind: "cm", nodeKey: group.nodeKey, from: match.from, to: match.to })
      }
    } else {
      // this is a prose node — emit a proportional share of lexical matches.
      // each non-codeblock node gets floor(remaining / remaining_slots) matches,
      // with extras distributed to earlier slots.
      const remainingSlots = nonCodeBlockCount - (nodeIdx - codeBlockIdx)
      if (remainingSlots <= 0) continue
      const remainingLexical = lexicalMatches.length - lexicalIndex
      const share = Math.ceil(remainingLexical / remainingSlots)

      for (let i = 0; i < share && lexicalIndex < lexicalMatches.length; i++) {
        if (result.length >= MAX_UNIFIED_MATCHES) return result
        result.push({ kind: "lexical", index: lexicalIndex++ })
      }
    }
  }

  // emit any remaining lexical matches (shouldn't happen but be safe)
  while (lexicalIndex < lexicalMatches.length && result.length < MAX_UNIFIED_MATCHES) {
    result.push({ kind: "lexical", index: lexicalIndex++ })
  }

  return result
}
