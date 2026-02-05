/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GitBranchBadge } from "@/components/git-branch-badge"
import { gitBranchAtom } from "@/lib/atoms/git"

describe("GitBranchBadge", () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    if (container) {
      document.body.removeChild(container)
    }
  })

  it("returns null when branch is null", async () => {
    const store = createStore()
    store.set(gitBranchAtom, null)

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    // Should render nothing
    expect(container?.querySelector("span")).toBeNull()
  })

  it("renders branch name correctly", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain("main")
  })

  it("renders feature branch names with slashes", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "feature/my-awesome-feature")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    expect(badge?.textContent).toContain("feature/my-awesome-feature")
  })

  it("renders GitBranch icon", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    // The lucide-react GitBranch icon renders as an SVG
    const svg = container?.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains("h-3")).toBe(true)
    expect(svg?.classList.contains("w-3")).toBe(true)
  })

  it("applies custom className", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge className="my-custom-class" />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    expect(badge?.classList.contains("my-custom-class")).toBe(true)
  })

  it("sets title attribute with branch name", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "develop")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    expect(badge?.getAttribute("title")).toBe("git branch: develop")
  })

  it("handles long branch names", async () => {
    const store = createStore()
    const longBranchName = "feature/very-long-branch-name-that-might-cause-overflow-issues"
    store.set(gitBranchAtom, longBranchName)

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    expect(badge?.textContent).toContain(longBranchName)
    // Should still render without breaking
    expect(badge).not.toBeNull()
  })

  it("updates when branch atom changes", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    let badge = container?.querySelector("span")
    expect(badge?.textContent).toContain("main")

    // Update the atom
    await act(async () => {
      store.set(gitBranchAtom, "develop")
    })

    badge = container?.querySelector("span")
    expect(badge?.textContent).toContain("develop")
  })

  it("transitions from null to branch name", async () => {
    const store = createStore()
    store.set(gitBranchAtom, null)

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    // Initially null - should render nothing
    expect(container?.querySelector("span")).toBeNull()

    // Update to a branch name
    await act(async () => {
      store.set(gitBranchAtom, "main")
    })

    // Now should render
    const badge = container?.querySelector("span")
    expect(badge?.textContent).toContain("main")
  })

  it("transitions from branch name to null", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    // Initially has branch
    expect(container?.querySelector("span")).not.toBeNull()

    // Update to null
    await act(async () => {
      store.set(gitBranchAtom, null)
    })

    // Should no longer render
    expect(container?.querySelector("span")).toBeNull()
  })

  it("has correct CSS classes for styling", async () => {
    const store = createStore()
    store.set(gitBranchAtom, "main")

    await act(async () => {
      root!.render(
        <Provider store={store}>
          <GitBranchBadge />
        </Provider>,
      )
    })

    const badge = container?.querySelector("span")
    // Check for expected styling classes
    expect(badge?.classList.contains("inline-flex")).toBe(true)
    expect(badge?.classList.contains("items-center")).toBe(true)
    expect(badge?.classList.contains("rounded-md")).toBe(true)
    expect(badge?.classList.contains("font-mono")).toBe(true)
  })
})
