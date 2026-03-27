/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"

import {
  updateSearchHighlights,
  clearSearchHighlights,
  scrollToCurrentMatch,
  type SearchMatch,
} from "@/lib/search/highlight-manager"

// ---------------------------------------------------------------------------
// mocks — jsdom does not support the CSS Custom Highlight API
// ---------------------------------------------------------------------------

let mockHighlights: Map<string, any>

beforeEach(() => {
  mockHighlights = new Map<string, any>()

  Object.defineProperty(globalThis, "CSS", {
    value: { highlights: mockHighlights },
    writable: true,
    configurable: true,
  })

  // @ts-expect-error — mock constructor
  globalThis.Highlight = class MockHighlight {
    ranges: Range[]
    constructor(...ranges: Range[]) {
      this.ranges = ranges
    }
  }
})

afterEach(() => {
  document.body.innerHTML = ""
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** create a text node attached to the DOM (ranges require a parent) */
function makeTextNode(text: string): Text {
  const node = document.createTextNode(text)
  const parent = document.createElement("div")
  parent.appendChild(node)
  document.body.appendChild(parent)
  return node
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("highlight-manager", () => {
  describe("updateSearchHighlights", () => {
    it("should set both highlight entries for basic matches", () => {
      const node = makeTextNode("hello world foo bar")

      const matches: SearchMatch[] = [
        { ranges: [{ node, startOffset: 0, endOffset: 5 }] },
        { ranges: [{ node, startOffset: 12, endOffset: 15 }] },
      ]

      updateSearchHighlights(matches, 0)

      expect(mockHighlights.has("search-match")).toBe(true)
      expect(mockHighlights.has("search-match-current")).toBe(true)

      // "search-match" contains a range for every match
      const allHighlight = mockHighlights.get("search-match")
      expect(allHighlight.ranges).toHaveLength(2)

      // "search-match-current" contains only the current match range
      const currentHighlight = mockHighlights.get("search-match-current")
      expect(currentHighlight.ranges).toHaveLength(1)
    })

    it("should clear highlights when matches is empty", () => {
      const node = makeTextNode("test")
      updateSearchHighlights([{ ranges: [{ node, startOffset: 0, endOffset: 4 }] }], 0)
      expect(mockHighlights.size).toBeGreaterThan(0)

      updateSearchHighlights([], 0)
      expect(mockHighlights.size).toBe(0)
    })

    it("should update current highlight when cycling index", () => {
      const node = makeTextNode("aaa bbb ccc")

      const matches: SearchMatch[] = [
        { ranges: [{ node, startOffset: 0, endOffset: 3 }] },
        { ranges: [{ node, startOffset: 4, endOffset: 7 }] },
      ]

      // first call — current is index 0
      updateSearchHighlights(matches, 0)
      const current0 = mockHighlights.get("search-match-current")
      const range0: Range = current0.ranges[0]
      expect(range0.startOffset).toBe(0)

      // second call — current is index 1
      updateSearchHighlights(matches, 1)
      const current1 = mockHighlights.get("search-match-current")
      const range1: Range = current1.ranges[0]
      expect(range1.startOffset).toBe(4)
    })

    it("should omit current highlight when index is out of bounds", () => {
      const node = makeTextNode("hello")
      const matches: SearchMatch[] = [{ ranges: [{ node, startOffset: 0, endOffset: 5 }] }]

      updateSearchHighlights(matches, 5)

      expect(mockHighlights.has("search-match")).toBe(true)
      expect(mockHighlights.has("search-match-current")).toBe(false)
    })

    it("should include all ranges for a multi-range match", () => {
      const nodeA = makeTextNode("hello ")
      const nodeB = makeTextNode("world")

      const matches: SearchMatch[] = [
        {
          ranges: [
            { node: nodeA, startOffset: 4, endOffset: 6 },
            { node: nodeB, startOffset: 0, endOffset: 3 },
          ],
        },
      ]

      updateSearchHighlights(matches, 0)

      const allHighlight = mockHighlights.get("search-match")
      expect(allHighlight.ranges).toHaveLength(2)

      const currentHighlight = mockHighlights.get("search-match-current")
      expect(currentHighlight.ranges).toHaveLength(2)
    })
  })

  describe("clearSearchHighlights", () => {
    it("should remove both highlight entries", () => {
      const node = makeTextNode("test")
      updateSearchHighlights([{ ranges: [{ node, startOffset: 0, endOffset: 4 }] }], 0)
      expect(mockHighlights.size).toBe(2)

      clearSearchHighlights()
      expect(mockHighlights.size).toBe(0)
    })
  })

  describe("no-throw when CSS.highlights is unavailable", () => {
    it("should not throw when CSS is undefined", () => {
      // @ts-expect-error — intentionally removing CSS
      globalThis.CSS = undefined

      const node = makeTextNode("test")
      const matches: SearchMatch[] = [{ ranges: [{ node, startOffset: 0, endOffset: 4 }] }]

      expect(() => updateSearchHighlights(matches, 0)).not.toThrow()
      expect(() => clearSearchHighlights()).not.toThrow()
    })

    it("should not throw when CSS.highlights is undefined", () => {
      // @ts-expect-error — intentionally removing highlights
      globalThis.CSS = { highlights: undefined }

      const node = makeTextNode("test")
      const matches: SearchMatch[] = [{ ranges: [{ node, startOffset: 0, endOffset: 4 }] }]

      expect(() => updateSearchHighlights(matches, 0)).not.toThrow()
      expect(() => clearSearchHighlights()).not.toThrow()
    })
  })

  describe("scrollToCurrentMatch", () => {
    it("should not throw when matches is empty", () => {
      expect(() => scrollToCurrentMatch([], 0)).not.toThrow()
    })

    it("should not throw when index is out of bounds", () => {
      const node = makeTextNode("test")
      const matches: SearchMatch[] = [{ ranges: [{ node, startOffset: 0, endOffset: 4 }] }]
      expect(() => scrollToCurrentMatch(matches, 5)).not.toThrow()
    })
  })
})
