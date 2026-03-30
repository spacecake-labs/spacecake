/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

import {
  registerCmView,
  unregisterCmView,
  getCmView,
  getAllCmViews,
  clearCmViewRegistry,
} from "@/lib/search/cm-view-registry"

const containers: HTMLElement[] = []
function createView(doc = "test"): EditorView {
  const container = document.createElement("div")
  document.body.appendChild(container)
  containers.push(container)
  return new EditorView({
    parent: container,
    state: EditorState.create({ doc }),
  })
}

afterEach(() => {
  clearCmViewRegistry()
  for (const c of containers) c.remove()
  containers.length = 0
})

describe("cm-view-registry", () => {
  it("registers and retrieves a view by node key", () => {
    const view = createView()
    registerCmView("node-1", view)

    expect(getCmView("node-1")).toBe(view)
  })

  it("returns undefined for unregistered keys", () => {
    expect(getCmView("nonexistent")).toBeUndefined()
  })

  it("unregisters a view", () => {
    const view = createView()
    registerCmView("node-1", view)
    unregisterCmView("node-1")

    expect(getCmView("node-1")).toBeUndefined()
  })

  it("getAllCmViews returns all registered views", () => {
    const view1 = createView("doc1")
    const view2 = createView("doc2")
    registerCmView("n1", view1)
    registerCmView("n2", view2)

    const all = getAllCmViews()
    expect(all).toHaveLength(2)

    const keys = all.map(([k]) => k)
    expect(keys).toContain("n1")
    expect(keys).toContain("n2")
  })

  it("overwrites previous view when registering same key", () => {
    const view1 = createView("old")
    const view2 = createView("new")
    registerCmView("node-1", view1)
    registerCmView("node-1", view2)

    expect(getCmView("node-1")).toBe(view2)
  })

  it("clearCmViewRegistry removes all entries", () => {
    registerCmView("n1", createView())
    registerCmView("n2", createView())
    clearCmViewRegistry()

    expect(getAllCmViews()).toHaveLength(0)
  })

  it("handles unregister of non-existent key without error", () => {
    expect(() => unregisterCmView("nonexistent")).not.toThrow()
  })
})
