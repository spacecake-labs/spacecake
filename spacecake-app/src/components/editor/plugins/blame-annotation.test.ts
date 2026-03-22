/**
 * @vitest-environment jsdom
 */
import { EditorSelection, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  blameAnnotation,
  blameFacet,
  formatBlameText,
  formatTimeAgo,
} from "@/components/editor/plugins/blame-annotation"
import type { BlameLine } from "@/services/git-blame-parser"

// helper to create an editor view with blame data and get decorations
const createEditorWithBlame = (doc: string, blameData: BlameLine[], cursorPos?: number) => {
  const state = EditorState.create({
    doc,
    extensions: [blameAnnotation(blameData)],
    selection: cursorPos !== undefined ? EditorSelection.cursor(cursorPos) : undefined,
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const view = new EditorView({ state, parent: container })
  // focus so view.hasFocus returns true (blame hides when unfocused)
  view.contentDOM.focus()
  // force a decoration rebuild after focus
  view.dispatch({ selection: state.selection })
  return { view, container }
}

// jsdom doesn't support document.hasFocus(), so we mock it to return true
// so that CodeMirror's view.hasFocus works correctly in tests
vi.spyOn(document, "hasFocus").mockReturnValue(true)

// track containers for cleanup
const containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers) c.remove()
  containers.length = 0
})

const makeBlame = (overrides: Partial<BlameLine> & { line: number }): BlameLine => ({
  hash: "abcd1234abcd1234abcd1234abcd1234abcd1234",
  author: "user",
  date: new Date("2025-01-01T00:00:00Z"),
  summary: "fix parser",
  ...overrides,
})

describe("formatTimeAgo", () => {
  const now = new Date("2025-03-22T00:00:00Z").getTime()

  it("formats seconds as 'just now'", () => {
    expect(formatTimeAgo(new Date(now - 30_000), now)).toBe("just now")
  })

  it("formats minutes", () => {
    expect(formatTimeAgo(new Date(now - 5 * 60_000), now)).toBe("5 minutes ago")
  })

  it("formats single minute", () => {
    expect(formatTimeAgo(new Date(now - 60_000), now)).toBe("1 minute ago")
  })

  it("formats hours", () => {
    expect(formatTimeAgo(new Date(now - 3 * 3_600_000), now)).toBe("3 hours ago")
  })

  it("formats days (under 7)", () => {
    expect(formatTimeAgo(new Date(now - 3 * 86_400_000), now)).toBe("3 days ago")
  })

  it("formats 6 days as days, not weeks", () => {
    expect(formatTimeAgo(new Date(now - 6 * 86_400_000), now)).toBe("6 days ago")
  })

  it("formats 7 days as 1 week ago", () => {
    expect(formatTimeAgo(new Date(now - 7 * 86_400_000), now)).toBe("1 week ago")
  })

  it("formats 14 days as 2 weeks ago", () => {
    expect(formatTimeAgo(new Date(now - 14 * 86_400_000), now)).toBe("2 weeks ago")
  })

  it("formats months", () => {
    expect(formatTimeAgo(new Date(now - 60 * 86_400_000), now)).toBe("2 months ago")
  })

  it("formats years", () => {
    expect(formatTimeAgo(new Date(now - 400 * 86_400_000), now)).toBe("1 year ago")
  })
})

describe("formatBlameText", () => {
  it("formats annotation text correctly", () => {
    const now = new Date("2025-03-22T00:00:00Z").getTime()
    const blame = makeBlame({
      line: 1,
      date: new Date(now - 3 * 86_400_000),
    })
    const text = formatBlameText(blame, now)
    expect(text).toBe("user, 3 days ago")
  })
})

describe("blame annotation extension", () => {
  it("creates decoration on the correct line when blame data is provided", () => {
    const blame = [makeBlame({ line: 1 }), makeBlame({ line: 2, summary: "second line" })]
    const { view, container } = createEditorWithBlame("line one\nline two\nline three", blame, 0)
    containers.push(container)

    // cursor is on line 1, should show blame for line 1
    const annotations = container.querySelectorAll(".cm-blame-annotation")
    expect(annotations.length).toBe(1)
    expect(annotations[0].textContent).toContain("user")

    view.destroy()
  })

  it("shows nothing for uncommitted lines (all-zero hash)", () => {
    const blame = [makeBlame({ line: 1, hash: "0000000000000000000000000000000000000000" })]
    const { view, container } = createEditorWithBlame("uncommitted line", blame, 0)
    containers.push(container)

    const annotations = container.querySelectorAll(".cm-blame-annotation")
    expect(annotations.length).toBe(0)

    view.destroy()
  })

  it("updates decoration when cursor moves to a different line", () => {
    const blame = [
      makeBlame({ line: 1, summary: "first commit" }),
      makeBlame({ line: 2, summary: "second commit" }),
    ]
    const { view, container } = createEditorWithBlame("line one\nline two", blame, 0)
    containers.push(container)

    // initially on line 1 — inline text shows author + time, not summary
    let annotations = container.querySelectorAll(".cm-blame-annotation")
    expect(annotations.length).toBe(1)
    expect(annotations[0].textContent).toContain("user")

    // move cursor to line 2
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.line(2).from),
    })

    annotations = container.querySelectorAll(".cm-blame-annotation")
    expect(annotations.length).toBe(1)
    expect(annotations[0].textContent).toContain("user")

    view.destroy()
  })

  it("clears decoration when blame data is empty", () => {
    const { view, container } = createEditorWithBlame("some code", [], 0)
    containers.push(container)

    const annotations = container.querySelectorAll(".cm-blame-annotation")
    expect(annotations.length).toBe(0)

    view.destroy()
  })

  it("reads blame data from the facet", () => {
    const blame = [makeBlame({ line: 1 })]
    const state = EditorState.create({
      doc: "test",
      extensions: [blameFacet.of(blame)],
    })
    const data = state.facet(blameFacet)
    expect(data).toEqual(blame)
  })

  it("widget has no pointer-events: none style", () => {
    const blame = [makeBlame({ line: 1 })]
    const { view, container } = createEditorWithBlame("line one", blame, 0)
    containers.push(container)

    const annotation = container.querySelector(".cm-blame-annotation") as HTMLElement
    expect(annotation).toBeTruthy()
    expect(annotation.style.pointerEvents).not.toBe("none")

    view.destroy()
  })

  it("shows branch icon in inline annotation", () => {
    const blame = [makeBlame({ line: 1 })]
    const { view, container } = createEditorWithBlame("line one", blame, 0)
    containers.push(container)

    const icon = container.querySelector(".cm-blame-icon") as HTMLElement
    expect(icon).toBeTruthy()
    expect(icon.querySelector("svg")).toBeTruthy()

    view.destroy()
  })
})
