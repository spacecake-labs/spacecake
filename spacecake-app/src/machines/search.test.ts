/**
 * @vitest-environment jsdom
 */
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from "lexical"
import { afterEach, describe, expect, it } from "vitest"
import { createActor, type Actor, type SnapshotFrom } from "xstate"

import { searchMachine, type SearchMachine } from "@/machines/search"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const containers: HTMLElement[] = []
const activeActors: Actor<SearchMachine>[] = []

function createLexicalEditor(text?: string) {
  const root = document.createElement("div")
  root.setAttribute("contenteditable", "true")
  document.body.appendChild(root)
  containers.push(root)

  const editor = createEditor({ namespace: "test", onError: console.error })
  editor.setRootElement(root)

  if (text) {
    editor.update(
      () => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(text))
        $getRoot().clear().append(paragraph)
      },
      { discrete: true },
    )
  }

  return editor
}

function startActor(editor: ReturnType<typeof createLexicalEditor>) {
  const actor = createActor(searchMachine, { input: { editor } })
  activeActors.push(actor)
  actor.start()
  return actor
}

type SearchActor = Actor<SearchMachine>

function getState(actor: SearchActor): string {
  const snapshot = actor.getSnapshot()
  const value = snapshot.value
  if (typeof value === "string") return value
  const [parent, child] = Object.entries(value)[0]
  return `${parent}.${child}`
}

function getContext(actor: SearchActor): SnapshotFrom<SearchMachine>["context"] {
  return actor.getSnapshot().context
}

/**
 * trigger an immediate search by opening with a target line.
 * this skips the debounce timer (always guard: hasTargetLine -> Searching).
 * targetLine is 0-based (LSP convention).
 */
function triggerSearch(actor: SearchActor, query: string, targetLine = 0) {
  actor.send({ type: "search.open", query, targetLine })
}

// ---------------------------------------------------------------------------
// setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  for (const a of activeActors) a.stop()
  activeActors.length = 0

  for (const c of containers) c.remove()
  containers.length = 0

  // clean up persisted options so tests don't leak state
  localStorage.removeItem("search-case-sensitive")
  localStorage.removeItem("search-whole-word")
  localStorage.removeItem("search-regex")
})

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("search machine", () => {
  describe("state transitions", () => {
    it("starts in Closed", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      expect(getState(actor)).toBe("Closed")
    })

    it("transitions to Open.Empty on search.open with no query", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      expect(getState(actor)).toBe("Open.Empty")
    })

    it("transitions back to Closed on search.close", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.close" })
      expect(getState(actor)).toBe("Closed")
    })

    it("transitions from Empty to Debouncing on non-empty query", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "test" })
      expect(getState(actor)).toBe("Open.Debouncing")
      expect(getContext(actor).query).toBe("test")
    })

    it("stays in Empty on empty query input", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "" })
      expect(getState(actor)).toBe("Open.Empty")
    })

    it("applies query from search.open event (workspace search handoff)", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)

      actor.send({ type: "search.open", query: "hello" })

      expect(getContext(actor).query).toBe("hello")
      expect(getState(actor)).toBe("Open.Debouncing")
    })

    it("applies targetLine from search.open event and skips debounce", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)

      actor.send({ type: "search.open", query: "hello", targetLine: 5 })

      // should have skipped debounce and searched
      expect(getState(actor)).toBe("Open.HasResults")
      expect(getContext(actor).matchCount).toBe(1)
      expect(getContext(actor).targetLine).toBeNull()
    })

    it("close from any Open child state returns to Closed", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "test" })
      expect(getState(actor)).toBe("Open.Debouncing")
      actor.send({ type: "search.close" })
      expect(getState(actor)).toBe("Closed")
    })

    it("re-opening while open re-evaluates and increments focusTrigger", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      const ft1 = getContext(actor).focusTrigger
      actor.send({ type: "search.open", query: "hello" })
      expect(getContext(actor).focusTrigger).toBe(ft1 + 1)
      expect(getContext(actor).query).toBe("hello")
      expect(getState(actor)).toBe("Open.Debouncing")
    })
  })

  describe("debouncing", () => {
    it("enters Debouncing on non-empty query", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "hello" })
      expect(getState(actor)).toBe("Open.Debouncing")
    })

    it("re-enters Debouncing on query change", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "h" })
      actor.send({ type: "search.input.change", query: "he" })
      expect(getState(actor)).toBe("Open.Debouncing")
      expect(getContext(actor).query).toBe("he")
    })

    it("updates options on options.change during debounce", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "test" })
      actor.send({
        type: "search.options.change",
        caseSensitive: true,
        wholeWord: true,
        regex: false,
      })
      expect(getContext(actor).caseSensitive).toBe(true)
      expect(getContext(actor).wholeWord).toBe(true)
      expect(getState(actor)).toBe("Open.Debouncing")
    })

    it("stays in Debouncing on content.change", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.input.change", query: "test" })
      actor.send({ type: "search.content.change" })
      expect(getState(actor)).toBe("Open.Debouncing")
    })

    it("skips debounce when target line is set", () => {
      const editor = createLexicalEditor("hello world hello")
      const actor = startActor(editor)
      actor.send({ type: "search.open", query: "hello", targetLine: 0 })

      // always guard fires: hasTargetLine -> Searching -> HasResults
      expect(getState(actor)).toBe("Open.HasResults")
    })

    it("preserves target line when search finds no results", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open", query: "test", targetLine: 42 })

      // no content → 0 results → targetLine kept so a subsequent
      // search (after content loads) can still navigate to the right line
      expect(getContext(actor).targetLine).toBe(42)
      expect(getState(actor)).toBe("Open.Empty")
    })
  })

  describe("search execution with prose", () => {
    it("finds matches in lexical prose content", () => {
      const editor = createLexicalEditor("hello world hello")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "hello")

      expect(getState(actor)).toBe("Open.HasResults")
      expect(getContext(actor).matchCount).toBe(2)
      expect(getContext(actor).matchIndex).toBe(0)
    })

    it("returns to Empty when no matches found", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "zzz")

      expect(getState(actor)).toBe("Open.Empty")
      expect(getContext(actor).matchCount).toBe(0)
    })

    it("resets matchIndex to 0 on new search", () => {
      const editor = createLexicalEditor("aaa bbb aaa ccc aaa")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "aaa")

      expect(getContext(actor).matchCount).toBe(3)

      // navigate to index 2
      actor.send({ type: "search.navigate.to", matchIndex: 2 })
      expect(getContext(actor).matchIndex).toBe(2)

      // new search resets matchIndex to 0
      triggerSearch(actor, "bbb")
      expect(getContext(actor).matchIndex).toBe(0)
      expect(getContext(actor).matchCount).toBe(1)
    })

    it("handles case-sensitive search", () => {
      const editor = createLexicalEditor("Hello hello HELLO")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "Hello")

      expect(getContext(actor).matchCount).toBe(3) // case-insensitive default

      // switch to case-sensitive and trigger immediate re-search
      actor.send({
        type: "search.options.change",
        caseSensitive: true,
        wholeWord: false,
        regex: false,
      })
      actor.send({ type: "search.open", query: "Hello", targetLine: 0 })

      expect(getContext(actor).matchCount).toBe(1)
    })

    it("re-searches on content change via target line", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "hello")

      expect(getContext(actor).matchCount).toBe(1)

      // manually add more text to DOM
      const root = editor.getRootElement()!
      const textNode = root.querySelector("[data-lexical-text]")
      if (textNode) {
        textNode.textContent = "hello world hello again"
      }

      // content change goes to Debouncing; re-open with targetLine skips to Searching
      actor.send({ type: "search.content.change" })
      actor.send({ type: "search.open", query: "hello", targetLine: 0 })

      expect(getContext(actor).matchCount).toBe(2)
    })
  })

  describe("navigation", () => {
    it("updates matchIndex on navigate.to", () => {
      const editor = createLexicalEditor("aaa bbb aaa ccc aaa")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "aaa")

      expect(getContext(actor).matchCount).toBe(3)
      actor.send({ type: "search.navigate.to", matchIndex: 2 })
      expect(getContext(actor).matchIndex).toBe(2)
    })

    it("clamps matchIndex to valid range", () => {
      const editor = createLexicalEditor("aaa bbb aaa")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "aaa")

      expect(getContext(actor).matchCount).toBe(2)
      actor.send({ type: "search.navigate.to", matchIndex: 10 })
      expect(getContext(actor).matchIndex).toBe(1) // clamped
    })

    it("ignores navigate.to with same index", () => {
      const editor = createLexicalEditor("hello world hello")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "hello")

      expect(getContext(actor).matchIndex).toBe(0)
      actor.send({ type: "search.navigate.to", matchIndex: 0 })
      expect(getContext(actor).matchIndex).toBe(0)
      expect(getState(actor)).toBe("Open.HasResults")
    })

    it("does not process navigate.to in Empty state", () => {
      const editor = createLexicalEditor()
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      actor.send({ type: "search.navigate.to", matchIndex: 5 })
      expect(getState(actor)).toBe("Open.Empty")
    })
  })

  describe("navigation target line", () => {
    it("skips debounce and navigates to target line match", () => {
      const editor = createLexicalEditor("hello world hello")
      const actor = startActor(editor)
      actor.send({ type: "search.open", query: "hello", targetLine: 0 })

      expect(getState(actor)).toBe("Open.HasResults")
      expect(getContext(actor).matchCount).toBe(2)
      expect(getContext(actor).targetLine).toBeNull()
    })

    it("re-opening with targetLine while in HasResults navigates to line", () => {
      const editor = createLexicalEditor("hello world hello")
      const actor = startActor(editor)
      triggerSearch(actor, "hello")

      expect(getState(actor)).toBe("Open.HasResults")

      // second result click — re-open with targetLine while already in HasResults
      actor.send({ type: "search.open", query: "hello", targetLine: 0 })
      expect(getState(actor)).toBe("Open.HasResults")
      expect(getContext(actor).targetLine).toBeNull()
    })
  })

  describe("close cleanup", () => {
    it("clears context when closing from HasResults", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "hello")

      expect(getContext(actor).matchCount).toBe(1)

      actor.send({ type: "search.close" })

      expect(getState(actor)).toBe("Closed")
      expect(getContext(actor).matchCount).toBe(0)
      expect(getContext(actor).unifiedMatches).toHaveLength(0)
    })

    it("clears results when entering Empty from HasResults", () => {
      const editor = createLexicalEditor("hello world")
      const actor = startActor(editor)
      actor.send({ type: "search.open" })
      triggerSearch(actor, "hello")

      expect(getState(actor)).toBe("Open.HasResults")

      actor.send({ type: "search.input.change", query: "" })
      expect(getState(actor)).toBe("Open.Empty")
      expect(getContext(actor).matchCount).toBe(0)
    })
  })
})
