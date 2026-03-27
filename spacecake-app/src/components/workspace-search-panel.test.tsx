/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceSearchPanel } from "@/components/workspace-search-panel"
import { searchQueryAtom } from "@/lib/atoms/search"
import { workspaceSearchOpenAtom } from "@/lib/atoms/workspace-search"
import type { SearchResult } from "@/services/ripgrep-search"
import { right } from "@/types/adt"

// the virtualizer needs ResizeObserver to measure the scroll container
class MockResizeObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    // immediately fire with a fake entry so the virtualizer measures the element
    this.callback(
      [
        {
          target,
          contentRect: { width: 400, height: 800 } as DOMRectReadOnly,
          borderBoxSize: [{ blockSize: 800, inlineSize: 400 }] as unknown as ResizeObserverSize[],
          contentBoxSize: [{ blockSize: 800, inlineSize: 400 }] as unknown as ResizeObserverSize[],
          devicePixelContentBoxSize: [] as ResizeObserverSize[],
        },
      ],
      this,
    )
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const mockWorkspace = vi.fn()

const sampleResults: SearchResult[] = [
  {
    file: "/home/user/projects/src/app.ts",
    matches: [
      {
        path: "/home/user/projects/src/app.ts",
        lineNumber: 10,
        column: 5,
        lineContent: "const hello = 'world'",
        matchStart: 6,
        matchEnd: 11,
      },
      {
        path: "/home/user/projects/src/app.ts",
        lineNumber: 20,
        column: 0,
        lineContent: "export function hello() {}",
        matchStart: 16,
        matchEnd: 21,
      },
    ],
  },
  {
    file: "/home/user/projects/src/utils.ts",
    matches: [
      {
        path: "/home/user/projects/src/utils.ts",
        lineNumber: 5,
        column: 0,
        lineContent: "function hello() { return true }",
        matchStart: 9,
        matchEnd: 14,
      },
    ],
  },
]

describe("WorkspaceSearchPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>
  const onResultClick = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()

    // mock electronAPI
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      search: { workspace: mockWorkspace },
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    onResultClick.mockClear()
    mockWorkspace.mockReset()
    mockWorkspace.mockResolvedValue(right({ results: [], limitHit: false }))

    // mock offsetHeight so the virtualizer measures a non-zero scroll container
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 800
      },
    })
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 800
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function renderPanel() {
    act(() => {
      root.render(
        <Provider store={store}>
          <WorkspaceSearchPanel workspacePath="/home/user/projects" onResultClick={onResultClick} />
        </Provider>,
      )
    })
  }

  it("renders search input and header", () => {
    renderPanel()

    const header = container.querySelector('[data-testid="workspace-search-header"]')
    expect(header).not.toBeNull()
    expect(header?.textContent).toBe("search")

    const input = container.querySelector('[data-testid="workspace-search-input"]')
    expect(input).not.toBeNull()

    const includeInput = container.querySelector('[data-testid="workspace-search-include"]')
    expect(includeInput).not.toBeNull()

    const excludeInput = container.querySelector('[data-testid="workspace-search-exclude"]')
    expect(excludeInput).not.toBeNull()
  })

  it("typing in search input updates searchQueryAtom", () => {
    renderPanel()

    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    expect(input).not.toBeNull()

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      nativeInputValueSetter.call(input, "hello")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(store.get(searchQueryAtom)).toBe("hello")
  })

  it("displays results grouped by file", async () => {
    // configure mock to return sample results
    mockWorkspace.mockResolvedValue(right({ results: sampleResults, limitHit: false }))
    renderPanel()

    // type a query to trigger the debounced search
    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "hello")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past the 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(350)
      // flush the resolved promise
      await Promise.resolve()
      await Promise.resolve()
    })

    const fileHeaders = container.querySelectorAll('[data-testid="workspace-search-file-header"]')
    expect(fileHeaders.length).toBe(2)

    // first file header shows relative path
    expect(fileHeaders[0].textContent).toContain("src/app.ts")
    // match count badge
    expect(fileHeaders[0].textContent).toContain("2")

    // second file header
    expect(fileHeaders[1].textContent).toContain("src/utils.ts")
    expect(fileHeaders[1].textContent).toContain("1")

    const matchRows = container.querySelectorAll('[data-testid="workspace-search-match-row"]')
    expect(matchRows.length).toBe(3)
  })

  it("shows 'no results' when query non-empty and no matches", async () => {
    // mock returns empty results
    mockWorkspace.mockResolvedValue(right({ results: [], limitHit: false }))
    renderPanel()

    // type a query
    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "nonexistent")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past debounce and flush promise
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    const noResults = container.querySelector('[data-testid="workspace-search-no-results"]')
    expect(noResults).not.toBeNull()
    expect(noResults?.textContent).toBe("no results")
  })

  it("shows 'searching...' while loading", () => {
    renderPanel()

    // type a query — the effect immediately sets loading to true
    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "hello")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // don't advance timers — the debounce hasn't fired, so loading is still true
    const loadingEl = container.querySelector('[data-testid="workspace-search-loading"]')
    expect(loadingEl).not.toBeNull()
    expect(loadingEl?.textContent).toBe("searching...")
  })

  it("shows result count in status bar", async () => {
    mockWorkspace.mockResolvedValue(right({ results: sampleResults, limitHit: false }))
    renderPanel()

    // type a query to trigger search
    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "hello")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past debounce and flush promise
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    const resultCount = container.querySelector('[data-testid="workspace-search-result-count"]')
    expect(resultCount).not.toBeNull()
    expect(resultCount?.textContent).toBe("3 results in 2 files")
  })

  it("clicking a result calls onResultClick with correct path and line number", async () => {
    mockWorkspace.mockResolvedValue(right({ results: sampleResults, limitHit: false }))
    renderPanel()

    // type a query to trigger search
    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "hello")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past debounce and flush promise
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    const matchRows = container.querySelectorAll('[data-testid="workspace-search-match-row"]')
    expect(matchRows.length).toBe(3)

    // click the first match row (app.ts line 10)
    act(() => {
      matchRows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onResultClick).toHaveBeenCalledWith("/home/user/projects/src/app.ts", 10)
  })

  it("close button sets workspaceSearchOpenAtom to false", () => {
    store.set(workspaceSearchOpenAtom, true)
    renderPanel()

    const closeBtn = container.querySelector(
      '[data-testid="workspace-search-close"]',
    ) as HTMLButtonElement
    expect(closeBtn).not.toBeNull()

    act(() => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(workspaceSearchOpenAtom)).toBe(false)
  })
})
