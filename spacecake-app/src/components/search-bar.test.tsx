/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SearchBar } from "@/components/search-bar"
import { searchActorAtom } from "@/lib/atoms/search"

// mock the highlight manager so we don't need the CSS highlights API
vi.mock("@/lib/search/highlight-manager", () => ({
  clearSearchHighlights: vi.fn(),
}))

// ---------------------------------------------------------------------------
// mock actor — returns snapshots shaped like the search machine
// ---------------------------------------------------------------------------

function createMockActor(
  initial: {
    query?: string
    matchCount?: number
    matchIndex?: number
    caseSensitive?: boolean
    wholeWord?: boolean
    regex?: boolean
    focusTrigger?: number
  } = {},
) {
  const context = {
    query: initial.query ?? "",
    matchCount: initial.matchCount ?? 0,
    matchIndex: initial.matchIndex ?? 0,
    caseSensitive: initial.caseSensitive ?? false,
    wholeWord: initial.wholeWord ?? false,
    regex: initial.regex ?? false,
    focusTrigger: initial.focusTrigger ?? 0,
  }
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => ({ context }),
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return { unsubscribe: () => listeners.delete(cb) }
    },
    send: vi.fn(),
    // test helper: update context and notify subscribers
    _update: (patch: Partial<typeof context>) => {
      Object.assign(context, patch)
      listeners.forEach((cb) => cb())
    },
  }
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("SearchBar", () => {
  let container: HTMLDivElement
  let root: Root
  let testStore: ReturnType<typeof createStore>
  let mockActor: ReturnType<typeof createMockActor>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    testStore = createStore()
    mockActor = createMockActor()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    testStore.set(searchActorAtom, mockActor as any)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderSearchBar() {
    act(() => {
      root.render(
        <Provider store={testStore}>
          <SearchBar />
        </Provider>,
      )
    })
  }

  it("renders input, buttons, and match counter", () => {
    mockActor._update({ query: "hello", matchCount: 3 })
    renderSearchBar()

    expect(container.querySelector('[data-testid="search-input"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-prev"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-next"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-case-toggle"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-regex-toggle"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-close"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-match-counter"]')).not.toBeNull()
  })

  it("typing in input sends search.input.change to the machine", () => {
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement
    expect(input).not.toBeNull()

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      nativeInputValueSetter.call(input, "test query")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith({
      type: "search.input.change",
      query: "test query",
    })
  })

  it("pressing Enter sends navigate.to with next index", () => {
    mockActor._update({ query: "hello", matchCount: 3, matchIndex: 0 })
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(mockActor.send).toHaveBeenCalledWith({
      type: "search.navigate.to",
      matchIndex: 1,
    })
  })

  it("pressing Shift+Enter sends navigate.to with previous index", () => {
    mockActor._update({ query: "hello", matchCount: 3, matchIndex: 0 })
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    // shift+enter from index 0 should wrap to 2
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
      )
    })
    expect(mockActor.send).toHaveBeenCalledWith({
      type: "search.navigate.to",
      matchIndex: 2,
    })
  })

  it("pressing Escape sends search.close to the machine", () => {
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith({ type: "search.close" })
  })

  it("match counter shows '1 of 5' format", () => {
    mockActor._update({ query: "hello", matchCount: 5, matchIndex: 0 })
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
    expect(counter?.querySelector(".absolute")?.textContent).toBe("1 of 5")
  })

  it("shows 'no results' when matchCount is 0 and query is non-empty", () => {
    mockActor._update({ query: "nonexistent", matchCount: 0 })
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
    expect(counter?.querySelector(".absolute")?.textContent).toBe("no results")
  })

  it("renders stable-width match counter when query is empty", () => {
    mockActor._update({ query: "", matchCount: 0 })
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
  })

  it("case sensitive toggle sends options.change event", () => {
    mockActor._update({ caseSensitive: false, wholeWord: false, regex: false })
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-case-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "search.options.change",
        caseSensitive: true,
      }),
    )
  })

  it("regex toggle sends options.change event", () => {
    mockActor._update({ caseSensitive: false, wholeWord: false, regex: false })
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-regex-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "search.options.change",
        regex: true,
      }),
    )
  })

  it("renders whole word toggle button", () => {
    renderSearchBar()

    const toggle = container.querySelector('[data-testid="search-whole-word-toggle"]')
    expect(toggle).not.toBeNull()
  })

  it("whole word toggle sends options.change event", () => {
    mockActor._update({ caseSensitive: false, wholeWord: false, regex: false })
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-whole-word-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "search.options.change",
        wholeWord: true,
      }),
    )
  })

  it("prev/next buttons are disabled when matchCount is 0", () => {
    mockActor._update({ query: "hello", matchCount: 0 })
    renderSearchBar()

    const prev = container.querySelector('[data-testid="search-prev"]') as HTMLButtonElement
    const next = container.querySelector('[data-testid="search-next"]') as HTMLButtonElement

    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it("prev/next buttons are enabled when matchCount > 0", () => {
    mockActor._update({ query: "hello", matchCount: 3 })
    renderSearchBar()

    const prev = container.querySelector('[data-testid="search-prev"]') as HTMLButtonElement
    const next = container.querySelector('[data-testid="search-next"]') as HTMLButtonElement

    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(false)
  })

  it("clicking close button sends search.close to the machine", () => {
    renderSearchBar()

    const closeBtn = container.querySelector('[data-testid="search-close"]') as HTMLButtonElement

    act(() => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(mockActor.send).toHaveBeenCalledWith({ type: "search.close" })
  })
})
