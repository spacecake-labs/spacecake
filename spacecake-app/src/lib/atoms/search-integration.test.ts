import { describe, expect, it } from "vitest"

import { consumePendingSearch, setPendingSearch } from "@/lib/atoms/search"

describe("workspace → in-file search handoff (pending search)", () => {
  it("stores and consumes a pending search", () => {
    setPendingSearch({ query: "hello", targetLine: 10, targetFile: "/home/user/projects/file.ts" })

    const pending = consumePendingSearch()
    expect(pending).toEqual({
      query: "hello",
      targetLine: 10,
      targetFile: "/home/user/projects/file.ts",
    })

    // consuming a second time returns null
    expect(consumePendingSearch()).toBeNull()
  })

  it("handles empty query without error", () => {
    setPendingSearch({ query: "", targetLine: 1, targetFile: null })

    const pending = consumePendingSearch()
    expect(pending).toEqual({ query: "", targetLine: 1, targetFile: null })
  })

  it("overwrites a previous pending search", () => {
    setPendingSearch({ query: "old", targetLine: 1, targetFile: null })
    setPendingSearch({ query: "new", targetLine: 5, targetFile: null })

    const pending = consumePendingSearch()
    expect(pending?.query).toBe("new")
    expect(pending?.targetLine).toBe(5)
  })

  it("returns null when no pending search has been set", () => {
    // ensure clean state
    consumePendingSearch()
    expect(consumePendingSearch()).toBeNull()
  })
})
