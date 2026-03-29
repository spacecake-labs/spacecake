/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SearchBar } from "@/components/search-bar"
import {
  searchCaseSensitiveAtom,
  searchMatchCountAtom,
  searchMatchIndexAtom,
  searchOpenAtom,
  searchQueryAtom,
  searchRegexAtom,
  searchWholeWordAtom,
} from "@/lib/atoms/search"

// mock the highlight manager so we don't need the CSS highlights API
vi.mock("@/lib/search/highlight-manager", () => ({
  clearSearchHighlights: vi.fn(),
}))

describe("SearchBar", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderSearchBar() {
    act(() => {
      root.render(
        <Provider store={store}>
          <SearchBar />
        </Provider>,
      )
    })
  }

  it("renders input, buttons, and match counter", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 3)
    renderSearchBar()

    expect(container.querySelector('[data-testid="search-input"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-prev"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-next"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-case-toggle"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-regex-toggle"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-close"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="search-match-counter"]')).not.toBeNull()
  })

  it("typing in input updates the search query", () => {
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement
    expect(input).not.toBeNull()

    act(() => {
      // simulate typing by dispatching native input event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      nativeInputValueSetter.call(input, "test query")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(store.get(searchQueryAtom)).toBe("test query")
  })

  it("pressing Enter increments match index with wrapping", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 3)
    store.set(searchMatchIndexAtom, 0)
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    // press Enter to go to next match
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(store.get(searchMatchIndexAtom)).toBe(1)

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(store.get(searchMatchIndexAtom)).toBe(2)

    // should wrap around
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(store.get(searchMatchIndexAtom)).toBe(0)
  })

  it("pressing Shift+Enter decrements match index with wrapping", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 3)
    store.set(searchMatchIndexAtom, 0)
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    // shift+enter from index 0 should wrap to 2
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
      )
    })
    expect(store.get(searchMatchIndexAtom)).toBe(2)

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
      )
    })
    expect(store.get(searchMatchIndexAtom)).toBe(1)
  })

  it("pressing Escape closes search", () => {
    store.set(searchOpenAtom, true)
    renderSearchBar()

    const input = container.querySelector('[data-testid="search-input"]') as HTMLInputElement

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })

    expect(store.get(searchOpenAtom)).toBe(false)
  })

  it("match counter shows '1 of 5' format", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 5)
    store.set(searchMatchIndexAtom, 0)
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
    expect(counter?.querySelector(".absolute")?.textContent).toBe("1 of 5")
  })

  it("shows 'no results' when matchCount is 0 and query is non-empty", () => {
    store.set(searchQueryAtom, "nonexistent")
    store.set(searchMatchCountAtom, 0)
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
    expect(counter?.querySelector(".absolute")?.textContent).toBe("no results")
  })

  it("renders stable-width match counter when query is empty", () => {
    store.set(searchQueryAtom, "")
    store.set(searchMatchCountAtom, 0)
    renderSearchBar()

    const counter = container.querySelector('[data-testid="search-match-counter"]')
    expect(counter).not.toBeNull()
  })

  it("case sensitive toggle button works", () => {
    store.set(searchCaseSensitiveAtom, false)
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-case-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(searchCaseSensitiveAtom)).toBe(true)
  })

  it("regex toggle button works", () => {
    store.set(searchRegexAtom, false)
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-regex-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(searchRegexAtom)).toBe(true)
  })

  it("renders whole word toggle button", () => {
    renderSearchBar()

    const toggle = container.querySelector('[data-testid="search-whole-word-toggle"]')
    expect(toggle).not.toBeNull()
  })

  it("whole word toggle button works", () => {
    store.set(searchWholeWordAtom, false)
    renderSearchBar()

    const toggle = container.querySelector(
      '[data-testid="search-whole-word-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(searchWholeWordAtom)).toBe(true)
  })

  it("prev/next buttons are disabled when matchCount is 0", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 0)
    renderSearchBar()

    const prev = container.querySelector('[data-testid="search-prev"]') as HTMLButtonElement
    const next = container.querySelector('[data-testid="search-next"]') as HTMLButtonElement

    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it("prev/next buttons are enabled when matchCount > 0", () => {
    store.set(searchQueryAtom, "hello")
    store.set(searchMatchCountAtom, 3)
    renderSearchBar()

    const prev = container.querySelector('[data-testid="search-prev"]') as HTMLButtonElement
    const next = container.querySelector('[data-testid="search-next"]') as HTMLButtonElement

    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(false)
  })

  it("clicking close button sets searchOpenAtom to false", () => {
    store.set(searchOpenAtom, true)
    renderSearchBar()

    const closeBtn = container.querySelector('[data-testid="search-close"]') as HTMLButtonElement

    act(() => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(searchOpenAtom)).toBe(false)
  })
})
