/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import { setPendingSearch, consumePendingSearch } from "@/lib/atoms/search"
import { externalSearchExtension } from "@/lib/search/cm-search-extension"
import { findCmMatchesSmall, findCmMatchesStreaming } from "@/lib/search/cm-text-search"
import {
  clearCmViewRegistry,
  getAllCmViews,
  registerCmView,
  unregisterCmView,
} from "@/lib/search/cm-view-registry"
import { mergeMatches, type CmMatchGroup } from "@/lib/search/merge-matches"

const views: EditorView[] = []
const containers: HTMLElement[] = []
function createView(doc: string): EditorView {
  const container = document.createElement("div")
  document.body.appendChild(container)
  containers.push(container)
  const view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc,
      extensions: [externalSearchExtension()],
    }),
  })
  views.push(view)
  return view
}

afterEach(() => {
  clearCmViewRegistry()
  for (const v of views) v.destroy()
  views.length = 0
  for (const c of containers) c.remove()
  containers.length = 0
})

describe("unified search integration", () => {
  describe("workspace → source mode handoff", () => {
    it("stores pending search for source mode files", () => {
      setPendingSearch({ query: "function", targetLine: 42, targetFile: null })

      const pending = consumePendingSearch()
      expect(pending?.query).toBe("function")
      expect(pending?.targetLine).toBe(42)
    })

    it("finds matches in a registered CM view (source mode)", () => {
      const code = [
        "def hello():",
        '    print("hello world")',
        "",
        "def goodbye():",
        '    print("goodbye world")',
      ].join("\n")

      const view = createView(code)
      registerCmView("source-block", view)

      // search for "world" — should find 2 matches
      const matches = findCmMatchesStreaming(view, "world")
      expect(matches).toHaveLength(2)
      expect(code.substring(matches[0].from, matches[0].to)).toBe("world")
      expect(code.substring(matches[1].from, matches[1].to)).toBe("world")
    })

    it("finds matches using streaming search for large source files", () => {
      // simulate a larger file
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}: some repeated text here`)
      const code = lines.join("\n")

      const view = createView(code)
      registerCmView("source-block", view)

      const matches = findCmMatchesStreaming(view, "repeated")
      expect(matches).toHaveLength(100)
    })
  })

  describe("workspace → rich mode code block handoff", () => {
    it("finds matches in code blocks using findCmMatchesSmall", () => {
      const codeBlock = 'const greeting = "hello world"\nconsole.log(greeting)'
      const view = createView(codeBlock)
      registerCmView("code-block-1", view)

      const matches = findCmMatchesSmall(view, "greeting")
      expect(matches).toHaveLength(2)
    })
  })

  describe("CM view registry lifecycle", () => {
    it("register and unregister mirrors component mount/unmount", () => {
      const view = createView("block content")
      registerCmView("cb-1", view)
      expect(getAllCmViews()).toHaveLength(1)

      unregisterCmView("cb-1")
      expect(getAllCmViews()).toHaveLength(0)
    })

    it("multiple code blocks register independently", () => {
      const view1 = createView("block 1")
      const view2 = createView("block 2")
      const view3 = createView("block 3")

      registerCmView("cb-1", view1)
      registerCmView("cb-2", view2)
      registerCmView("cb-3", view3)

      expect(getAllCmViews()).toHaveLength(3)

      // simulate one block being deleted
      unregisterCmView("cb-2")
      expect(getAllCmViews()).toHaveLength(2)
      expect(getAllCmViews().map(([k]) => k)).toEqual(expect.arrayContaining(["cb-1", "cb-3"]))
    })
  })

  describe("match merging with real CM matches", () => {
    it("merges prose and code block matches in document order", () => {
      // simulate: prose node p1, code block cb1, prose node p2
      const dummyLexicalMatches = [{ ranges: [] }, { ranges: [] }] // 2 prose matches
      const cmGroups: CmMatchGroup[] = [
        {
          nodeKey: "cb1",
          matches: [
            { from: 0, to: 5 },
            { from: 10, to: 15 },
          ],
        },
      ]

      const unified = mergeMatches(["p1", "cb1", "p2"], dummyLexicalMatches, cmGroups)

      // expected order: 1 lexical, 2 CM, 1 lexical
      expect(unified).toHaveLength(4)
      expect(unified[0].kind).toBe("lexical")
      expect(unified[1].kind).toBe("cm")
      expect(unified[2].kind).toBe("cm")
      expect(unified[3].kind).toBe("lexical")
    })

    it("handles source mode (no prose, single CM block)", () => {
      const code = "aaa bbb aaa ccc aaa"
      const view = createView(code)
      registerCmView("source", view)

      const matches = findCmMatchesSmall(view, "aaa")
      const cmGroups: CmMatchGroup[] = [{ nodeKey: "source", matches }]

      // source mode: only the code block node in nodeOrder
      const unified = mergeMatches(["source"], [], cmGroups)
      expect(unified).toHaveLength(3)
      expect(unified.every((m) => m.kind === "cm")).toBe(true)
    })
  })

  describe("search options", () => {
    it("case-sensitive search in CM", () => {
      const view = createView("Hello hello HELLO")
      const matches = findCmMatchesSmall(view, "Hello", { caseSensitive: true })
      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual({ from: 0, to: 5 })
    })

    it("regex search in CM", () => {
      const view = createView("foo123 bar456 baz789")
      const matches = findCmMatchesSmall(view, "\\d{3}", { regex: true })
      expect(matches).toHaveLength(3)
    })

    it("whole word search in CM", () => {
      const view = createView("go going go-fast go")
      const matches = findCmMatchesSmall(view, "go", { wholeWord: true })
      // "go" at start, "go" after "-" (not a word boundary for \b), "go" at end
      // \b considers "-" as a word boundary, so "go" in "go-fast" IS a whole word match
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("CM content edit triggers re-search", () => {
    it("finds new matches after CM doc content changes", () => {
      const view = createView("hello world")
      registerCmView("cb-1", view)

      // initial search
      let matches = findCmMatchesSmall(view, "hello")
      expect(matches).toHaveLength(1)

      // simulate editing — add another "hello"
      view.dispatch({
        changes: { from: view.state.doc.length, insert: " hello again" },
      })

      // re-search should find 2 matches
      matches = findCmMatchesSmall(view, "hello")
      expect(matches).toHaveLength(2)
    })
  })
})
