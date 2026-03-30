import { createStore } from "jotai"
import { describe, expect, it } from "vitest"

import { searchOpenAtom, searchQueryAtom, searchTargetLineAtom } from "@/lib/atoms/search"
import { workspaceSearchQueryAtom } from "@/lib/atoms/workspace-search"

// simulates what handleSearchResultClick does in w.$workspaceId.tsx:
// forwards the workspace query to the in-file search atoms so clicking a
// workspace search result opens the in-file search bar pre-filled.
function simulateSearchResultClick(store: ReturnType<typeof createStore>, lineNumber: number) {
  store.set(searchQueryAtom, store.get(workspaceSearchQueryAtom))
  store.set(searchOpenAtom, true)
  store.set(searchTargetLineAtom, lineNumber)
}

describe("workspace → in-file search handoff", () => {
  it("forwards workspace query to in-file search", () => {
    const store = createStore()
    store.set(workspaceSearchQueryAtom, "hello")

    simulateSearchResultClick(store, 10)

    expect(store.get(searchQueryAtom)).toBe("hello")
    expect(store.get(searchOpenAtom)).toBe(true)
    expect(store.get(searchTargetLineAtom)).toBe(10)
  })

  it("forwards empty query without error", () => {
    const store = createStore()
    store.set(workspaceSearchQueryAtom, "")

    simulateSearchResultClick(store, 1)

    expect(store.get(searchQueryAtom)).toBe("")
    expect(store.get(searchOpenAtom)).toBe(true)
    expect(store.get(searchTargetLineAtom)).toBe(1)
  })

  it("overwrites a previous in-file search query", () => {
    const store = createStore()
    store.set(searchQueryAtom, "old query")
    store.set(workspaceSearchQueryAtom, "new query")

    simulateSearchResultClick(store, 5)

    expect(store.get(searchQueryAtom)).toBe("new query")
  })

  it("opens in-file search even if it was already open", () => {
    const store = createStore()
    store.set(searchOpenAtom, true)
    store.set(searchQueryAtom, "stale")
    store.set(workspaceSearchQueryAtom, "fresh")

    simulateSearchResultClick(store, 42)

    expect(store.get(searchOpenAtom)).toBe(true)
    expect(store.get(searchQueryAtom)).toBe("fresh")
    expect(store.get(searchTargetLineAtom)).toBe(42)
  })
})
