/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest"

import { buildTextIndex, findMatches } from "@/lib/search/text-walker"

describe("text-walker", () => {
  describe("buildTextIndex", () => {
    it("should build index from a single text node", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)

      expect(index.fullText).toBe("hello world")
      expect(index.segments).toHaveLength(1)
      expect(index.segments[0].start).toBe(0)
      expect(index.segments[0].length).toBe(11)
    })

    it("should build index from multiple text nodes", () => {
      const root = document.createElement("div")
      const span1 = document.createElement("span")
      span1.textContent = "hello "
      const span2 = document.createElement("span")
      span2.textContent = "world"
      root.appendChild(span1)
      root.appendChild(span2)

      const index = buildTextIndex(root)

      expect(index.fullText).toBe("hello world")
      expect(index.segments).toHaveLength(2)
      expect(index.segments[0].start).toBe(0)
      expect(index.segments[0].length).toBe(6)
      expect(index.segments[1].start).toBe(6)
      expect(index.segments[1].length).toBe(5)
    })

    it("should return empty index for empty root element", () => {
      const root = document.createElement("div")

      const index = buildTextIndex(root)

      expect(index.fullText).toBe("")
      expect(index.segments).toHaveLength(0)
    })

    it("should skip text inside decorator nodes", () => {
      const root = document.createElement("div")
      const paragraph = document.createElement("p")
      paragraph.textContent = "visible text"

      const decorator = document.createElement("div")
      decorator.setAttribute("data-lexical-decorator", "true")
      decorator.textContent = "hidden codemirror content"

      root.appendChild(paragraph)
      root.appendChild(decorator)

      const index = buildTextIndex(root)

      expect(index.fullText).toBe("visible text")
      expect(index.segments).toHaveLength(1)
    })

    it("should skip text nested deep inside decorator nodes", () => {
      const root = document.createElement("div")
      const paragraph = document.createElement("p")
      paragraph.textContent = "visible"

      const decorator = document.createElement("div")
      decorator.setAttribute("data-lexical-decorator", "true")
      const inner = document.createElement("div")
      const deepSpan = document.createElement("span")
      deepSpan.textContent = "deep hidden"
      inner.appendChild(deepSpan)
      decorator.appendChild(inner)

      root.appendChild(paragraph)
      root.appendChild(decorator)

      const index = buildTextIndex(root)

      expect(index.fullText).toBe("visible")
    })
  })

  describe("findMatches", () => {
    it("should find a single match in a single text node", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "world")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(6)
      expect(matches[0].ranges[0].endOffset).toBe(11)
    })

    it("should find a match spanning multiple text nodes", () => {
      const root = document.createElement("div")
      const span1 = document.createElement("span")
      span1.textContent = "hello "
      const span2 = document.createElement("span")
      span2.textContent = "world"
      root.appendChild(span1)
      root.appendChild(span2)

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello world")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges).toHaveLength(2)
      // first range: "hello " in span1
      expect(matches[0].ranges[0].node).toBe(span1.firstChild)
      expect(matches[0].ranges[0].startOffset).toBe(0)
      expect(matches[0].ranges[0].endOffset).toBe(6)
      // second range: "world" in span2
      expect(matches[0].ranges[1].node).toBe(span2.firstChild)
      expect(matches[0].ranges[1].startOffset).toBe(0)
      expect(matches[0].ranges[1].endOffset).toBe(5)
    })

    it("should handle case-insensitive search (default)", () => {
      const root = document.createElement("div")
      root.textContent = "Hello World"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(0)
      expect(matches[0].ranges[0].endOffset).toBe(5)
    })

    it("should handle case-sensitive search", () => {
      const root = document.createElement("div")
      root.textContent = "Hello hello"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello", { caseSensitive: true })

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(6)
      expect(matches[0].ranges[0].endOffset).toBe(11)
    })

    it("should support regex search", () => {
      const root = document.createElement("div")
      root.textContent = "abc 123 def 456"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "\\d+", { regex: true })

      expect(matches).toHaveLength(2)
      expect(matches[0].ranges[0].startOffset).toBe(4)
      expect(matches[0].ranges[0].endOffset).toBe(7)
      expect(matches[1].ranges[0].startOffset).toBe(12)
      expect(matches[1].ranges[0].endOffset).toBe(15)
    })

    it("should return empty array for invalid regex", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "[invalid", { regex: true })

      expect(matches).toHaveLength(0)
    })

    it("should return empty array when no matches found", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "xyz")

      expect(matches).toHaveLength(0)
    })

    it("should return empty array for empty query", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "")

      expect(matches).toHaveLength(0)
    })

    it("should return empty array for empty root element", () => {
      const root = document.createElement("div")

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello")

      expect(matches).toHaveLength(0)
    })

    it("should find unicode characters", () => {
      const root = document.createElement("div")
      root.textContent = "caf\u00e9 na\u00efve"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "caf\u00e9")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(0)
      expect(matches[0].ranges[0].endOffset).toBe(4)
    })

    it("should not match text inside decorator nodes", () => {
      const root = document.createElement("div")
      const paragraph = document.createElement("p")
      paragraph.textContent = "visible text"

      const decorator = document.createElement("div")
      decorator.setAttribute("data-lexical-decorator", "true")
      decorator.textContent = "visible text inside decorator"

      root.appendChild(paragraph)
      root.appendChild(decorator)

      const index = buildTextIndex(root)
      const matches = findMatches(index, "visible text")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges).toHaveLength(1)
      expect(matches[0].ranges[0].node).toBe(paragraph.firstChild)
    })

    it("should find multiple non-overlapping matches", () => {
      const root = document.createElement("div")
      root.textContent = "aaa"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "a")

      expect(matches).toHaveLength(3)
      expect(matches[0].ranges[0].startOffset).toBe(0)
      expect(matches[0].ranges[0].endOffset).toBe(1)
      expect(matches[1].ranges[0].startOffset).toBe(1)
      expect(matches[1].ranges[0].endOffset).toBe(2)
      expect(matches[2].ranges[0].startOffset).toBe(2)
      expect(matches[2].ranges[0].endOffset).toBe(3)
    })

    it("should handle a match spanning three text nodes", () => {
      const root = document.createElement("div")
      const span1 = document.createElement("span")
      span1.textContent = "ab"
      const span2 = document.createElement("span")
      span2.textContent = "cd"
      const span3 = document.createElement("span")
      span3.textContent = "ef"
      root.appendChild(span1)
      root.appendChild(span2)
      root.appendChild(span3)

      const index = buildTextIndex(root)
      // match "bcde" which spans span1 (b), span2 (cd), span3 (e)
      const matches = findMatches(index, "bcde")

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges).toHaveLength(3)
      // span1: "b" (offset 1-2)
      expect(matches[0].ranges[0].node).toBe(span1.firstChild)
      expect(matches[0].ranges[0].startOffset).toBe(1)
      expect(matches[0].ranges[0].endOffset).toBe(2)
      // span2: "cd" (offset 0-2)
      expect(matches[0].ranges[1].node).toBe(span2.firstChild)
      expect(matches[0].ranges[1].startOffset).toBe(0)
      expect(matches[0].ranges[1].endOffset).toBe(2)
      // span3: "e" (offset 0-1)
      expect(matches[0].ranges[2].node).toBe(span3.firstChild)
      expect(matches[0].ranges[2].startOffset).toBe(0)
      expect(matches[0].ranges[2].endOffset).toBe(1)
    })

    it("should handle regex with case-insensitive flag", () => {
      const root = document.createElement("div")
      root.textContent = "Foo foo FOO"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "foo", { regex: true, caseSensitive: false })

      expect(matches).toHaveLength(3)
    })

    it("should match whole word only", () => {
      const root = document.createElement("div")
      root.textContent = "hello world"

      const index = buildTextIndex(root)

      const matches = findMatches(index, "hello", { wholeWord: true })
      expect(matches).toHaveLength(1)

      const noMatch = findMatches(index, "hell", { wholeWord: true })
      expect(noMatch).toHaveLength(0)
    })

    it("should not match partial words with whole word enabled", () => {
      const root = document.createElement("div")
      root.textContent = "helloworld"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello", { wholeWord: true })

      expect(matches).toHaveLength(0)
    })

    it("should match word at start and end of text", () => {
      const root = document.createElement("div")
      root.textContent = "hello world hello"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello", { wholeWord: true })

      expect(matches).toHaveLength(2)
    })

    it("should handle whole word with case insensitive", () => {
      const root = document.createElement("div")
      root.textContent = "Hello hello"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello", { wholeWord: true, caseSensitive: false })

      expect(matches).toHaveLength(2)
    })

    it("should handle whole word with regex", () => {
      const root = document.createElement("div")
      root.textContent = "cat catalog scatter"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "cat", { regex: true, wholeWord: true })

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(0)
      expect(matches[0].ranges[0].endOffset).toBe(3)
    })

    it("should match when query starts with non-word character", () => {
      const root = document.createElement("div")
      root.textContent = "foo (bar) baz"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "(bar)", { wholeWord: true })

      expect(matches).toHaveLength(1)
    })

    it("should match word next to punctuation", () => {
      const root = document.createElement("div")
      root.textContent = "hello, world"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "hello", { wholeWord: true })

      expect(matches).toHaveLength(1)
    })

    it("should handle regex with case-sensitive flag", () => {
      const root = document.createElement("div")
      root.textContent = "Foo foo FOO"

      const index = buildTextIndex(root)
      const matches = findMatches(index, "foo", { regex: true, caseSensitive: true })

      expect(matches).toHaveLength(1)
      expect(matches[0].ranges[0].startOffset).toBe(4)
      expect(matches[0].ranges[0].endOffset).toBe(7)
    })
  })
})
