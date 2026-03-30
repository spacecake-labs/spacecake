/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import { findCmMatchesSmall, findCmMatchesStreaming } from "@/lib/search/cm-text-search"

// helper to create a minimal CM EditorView with given content
const containers: HTMLElement[] = []
function createView(doc: string): EditorView {
  const container = document.createElement("div")
  document.body.appendChild(container)
  containers.push(container)
  return new EditorView({
    parent: container,
    state: EditorState.create({ doc }),
  })
}

afterEach(() => {
  for (const c of containers) c.remove()
  containers.length = 0
})

describe("findCmMatchesStreaming", () => {
  it("finds literal matches case-insensitively by default", () => {
    const view = createView("Hello hello HELLO")
    const matches = findCmMatchesStreaming(view, "hello")
    expect(matches).toHaveLength(3)
    expect(matches[0]).toEqual({ from: 0, to: 5 })
    expect(matches[1]).toEqual({ from: 6, to: 11 })
    expect(matches[2]).toEqual({ from: 12, to: 17 })
  })

  it("finds literal matches case-sensitively", () => {
    const view = createView("Hello hello HELLO")
    const matches = findCmMatchesStreaming(view, "hello", { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ from: 6, to: 11 })
  })

  it("returns empty for empty query", () => {
    const view = createView("some text")
    expect(findCmMatchesStreaming(view, "")).toHaveLength(0)
  })

  it("returns empty when no match found", () => {
    const view = createView("hello world")
    expect(findCmMatchesStreaming(view, "xyz")).toHaveLength(0)
  })

  it("respects maxMatches cap", () => {
    const view = createView("aaa aaa aaa aaa aaa")
    const matches = findCmMatchesStreaming(view, "aaa", {}, 2)
    expect(matches).toHaveLength(2)
  })

  it("finds regex matches", () => {
    const view = createView("foo123 bar456 baz")
    const matches = findCmMatchesStreaming(view, "\\w+\\d+", { regex: true })
    expect(matches).toHaveLength(2)
  })

  it("handles invalid regex gracefully", () => {
    const view = createView("some text")
    const matches = findCmMatchesStreaming(view, "[invalid", { regex: true })
    expect(matches).toHaveLength(0)
  })

  it("finds matches across multiple lines", () => {
    const view = createView("line one\nline two\nline three")
    const matches = findCmMatchesStreaming(view, "line")
    expect(matches).toHaveLength(3)
  })
})

describe("findCmMatchesSmall", () => {
  it("finds literal matches case-insensitively by default", () => {
    const view = createView("Hello hello HELLO")
    const matches = findCmMatchesSmall(view, "hello")
    expect(matches).toHaveLength(3)
  })

  it("finds literal matches case-sensitively", () => {
    const view = createView("Hello hello HELLO")
    const matches = findCmMatchesSmall(view, "hello", { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ from: 6, to: 11 })
  })

  it("supports whole word matching", () => {
    // "cat caterpillar concatenate cat"
    //  ^0                          ^27 (with trailing space: "e cat" -> cat starts at 28)
    const text = "cat caterpillar concatenate cat"
    const view = createView(text)
    const matches = findCmMatchesSmall(view, "cat", { wholeWord: true })
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ from: 0, to: 3 })
    // "concatenate " is 12 chars, starts at 16, so "cat" at end starts at 28
    expect(matches[1]).toEqual({ from: text.lastIndexOf("cat"), to: text.lastIndexOf("cat") + 3 })
  })

  it("supports regex matching", () => {
    const view = createView("foo123 bar456 baz")
    const matches = findCmMatchesSmall(view, "\\w+\\d+", { regex: true })
    expect(matches).toHaveLength(2)
  })

  it("handles invalid regex gracefully", () => {
    const view = createView("some text")
    const matches = findCmMatchesSmall(view, "[invalid", { regex: true })
    expect(matches).toHaveLength(0)
  })

  it("respects maxMatches cap", () => {
    const view = createView("a a a a a a a a a a")
    const matches = findCmMatchesSmall(view, "a", {}, 3)
    expect(matches).toHaveLength(3)
  })

  it("returns empty for empty query", () => {
    const view = createView("some text")
    expect(findCmMatchesSmall(view, "")).toHaveLength(0)
  })

  it("returns empty for empty document", () => {
    const view = createView("")
    expect(findCmMatchesSmall(view, "hello")).toHaveLength(0)
  })

  it("handles special regex characters in literal mode", () => {
    const view = createView("price is $10.00")
    const matches = findCmMatchesSmall(view, "$10.00")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ from: 9, to: 15 })
  })
})
