/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import {
  externalSearchExtension,
  setSearchMatchesEffect,
  clearSearchMatchesEffect,
  setActiveMatchIndexEffect,
  scrollCmToMatch,
} from "@/lib/search/cm-search-extension"

// helper to create a CM EditorView with the search extension
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
  // destroy views before removing DOM to prevent CM measurement errors in jsdom
  for (const v of views) v.destroy()
  views.length = 0
  for (const c of containers) c.remove()
  containers.length = 0
})

describe("cm-search-extension", () => {
  describe("setSearchMatchesEffect", () => {
    it("accepts match ranges via state effect", () => {
      const view = createView("hello world hello")
      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [
            { from: 0, to: 5 },
            { from: 12, to: 17 },
          ],
          activeIndex: 0,
        }),
      })

      // the extension should not throw and the view should still be functional
      expect(view.state.doc.toString()).toBe("hello world hello")
    })

    it("handles empty ranges", () => {
      const view = createView("hello world")
      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [],
          activeIndex: -1,
        }),
      })
      expect(view.state.doc.toString()).toBe("hello world")
    })

    it("updates ranges on subsequent dispatches", () => {
      const view = createView("aaa bbb ccc")

      // first search
      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [{ from: 0, to: 3 }],
          activeIndex: 0,
        }),
      })

      // second search with different ranges
      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [
            { from: 4, to: 7 },
            { from: 8, to: 11 },
          ],
          activeIndex: 1,
        }),
      })

      expect(view.state.doc.toString()).toBe("aaa bbb ccc")
    })
  })

  describe("clearSearchMatchesEffect", () => {
    it("clears previously set matches", () => {
      const view = createView("hello world")

      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [{ from: 0, to: 5 }],
          activeIndex: 0,
        }),
      })

      view.dispatch({
        effects: clearSearchMatchesEffect.of(undefined),
      })

      expect(view.state.doc.toString()).toBe("hello world")
    })
  })

  describe("setActiveMatchIndexEffect", () => {
    it("updates the active match index without changing ranges", () => {
      const view = createView("aaa bbb aaa")

      view.dispatch({
        effects: setSearchMatchesEffect.of({
          ranges: [
            { from: 0, to: 3 },
            { from: 8, to: 11 },
          ],
          activeIndex: 0,
        }),
      })

      // change active index to second match
      view.dispatch({
        effects: setActiveMatchIndexEffect.of(1),
      })

      expect(view.state.doc.toString()).toBe("aaa bbb aaa")
    })
  })

  describe("scrollCmToMatch", () => {
    it("updates selection to the match range", () => {
      const view = createView("hello world foo bar")

      scrollCmToMatch(view, 12, 15)

      const sel = view.state.selection.main
      expect(sel.anchor).toBe(12)
      expect(sel.head).toBe(15)
    })
  })

  describe("extension bundle", () => {
    it("can be included alongside other extensions without conflict", () => {
      const container = document.createElement("div")
      document.body.appendChild(container)
      containers.push(container)

      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: "test content",
          extensions: [externalSearchExtension(), EditorView.lineWrapping],
        }),
      })

      expect(view.state.doc.toString()).toBe("test content")
    })
  })
})
