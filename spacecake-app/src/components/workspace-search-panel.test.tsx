/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  flattenResults,
  type FlatRow,
  WorkspaceSearchPanel,
} from "@/components/workspace-search-panel"
import { searchQueryAtom, searchWholeWordAtom } from "@/lib/atoms/search"
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
        lineNumber: 10,
        column: 5,
        lineContent: "const hello = 'world'",
        matchStart: 6,
        matchEnd: 11,
      },
      {
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

    // include/exclude filters are behind a toggle and hidden by default
    const includeInput = container.querySelector('[data-testid="workspace-search-include"]')
    expect(includeInput).toBeNull()

    const excludeInput = container.querySelector('[data-testid="workspace-search-exclude"]')
    expect(excludeInput).toBeNull()

    // clicking the filters toggle reveals them
    const filtersToggle = container.querySelector(
      '[data-testid="workspace-search-filters-toggle"]',
    ) as HTMLButtonElement
    act(() => {
      filtersToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="workspace-search-include"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="workspace-search-exclude"]')).not.toBeNull()
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

    // first file header shows file name, dir path, and match count as separate spans
    expect(fileHeaders[0].textContent).toContain("app.ts")
    expect(fileHeaders[0].textContent).toContain("src")
    expect(fileHeaders[0].textContent).toContain("2")

    // second file header
    expect(fileHeaders[1].textContent).toContain("utils.ts")
    expect(fileHeaders[1].textContent).toContain("src")
    expect(fileHeaders[1].textContent).toContain("1")

    const matchRows = container.querySelectorAll('[data-testid="workspace-search-match-row"]')
    expect(matchRows.length).toBe(3)
  })

  it("shows 0 results in status bar when query non-empty and no matches", async () => {
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

    const resultCount = container.querySelector('[data-testid="workspace-search-result-count"]')
    expect(resultCount).not.toBeNull()
    expect(resultCount?.textContent).toBe("0 results in 0 files")
  })

  it("hides result count while loading", () => {
    renderPanel()

    // type a query — the onChange handler sets loading to true
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
    // the status bar should not show a result count while loading
    const resultCount = container.querySelector('[data-testid="workspace-search-result-count"]')
    expect(resultCount).toBeNull()
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

  it("shows 'results limited' banner when limitHit is true", async () => {
    mockWorkspace.mockResolvedValue(right({ results: sampleResults, limitHit: true }))
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

    const limitBanner = container.querySelector('[data-testid="workspace-search-limit-hit"]')
    expect(limitBanner).not.toBeNull()
    expect(limitBanner?.textContent).toBe("results limited")
  })

  it("does not show 'results limited' banner when limitHit is false", async () => {
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

    const limitBanner = container.querySelector('[data-testid="workspace-search-limit-hit"]')
    expect(limitBanner).toBeNull()
  })

  it("recovers gracefully when ipc transport rejects", async () => {
    // simulate an ipc channel failure (distinct from a search-level error)
    mockWorkspace.mockRejectedValue(new Error("ipc channel closed"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
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

    // advance past the 300ms debounce and flush the rejected promise
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    // panel should be in a clean, non-loading state with no results
    // the status bar shows the result count when loading is false and query is non-empty
    const resultCount = container.querySelector('[data-testid="workspace-search-result-count"]')
    expect(resultCount).not.toBeNull()
    expect(resultCount?.textContent).toBe("0 results in 0 files")

    const matchRows = container.querySelectorAll('[data-testid="workspace-search-match-row"]')
    expect(matchRows.length).toBe(0)

    const fileHeaders = container.querySelectorAll('[data-testid="workspace-search-file-header"]')
    expect(fileHeaders.length).toBe(0)

    spy.mockRestore()
  })

  it("discards stale responses when a newer search has already resolved", async () => {
    // results for the first query — should be discarded
    const staleResults: SearchResult[] = [
      {
        file: "/home/user/projects/src/stale.ts",
        matches: [
          {
            lineNumber: 1,
            column: 0,
            lineContent: "const stale = true",
            matchStart: 6,
            matchEnd: 11,
          },
        ],
      },
    ]

    // results for the second query — should be kept
    const freshResults: SearchResult[] = [
      {
        file: "/home/user/projects/src/fresh.ts",
        matches: [
          {
            lineNumber: 42,
            column: 0,
            lineContent: "const fresh = true",
            matchStart: 6,
            matchEnd: 11,
          },
        ],
      },
    ]

    // manually controlled promises so we can resolve them in any order
    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void

    const firstPromise = new Promise((r) => {
      resolveFirst = r
    })
    const secondPromise = new Promise((r) => {
      resolveSecond = r
    })

    // first call returns the slow promise, second call returns the fast promise
    mockWorkspace.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    renderPanel()

    const input = container.querySelector(
      '[data-testid="workspace-search-input"]',
    ) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!

    // type the first query
    act(() => {
      setter.call(input, "first")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past the 300ms debounce so the first IPC call fires
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    expect(mockWorkspace).toHaveBeenCalledTimes(1)

    // type the second query (clears debounce timer, starts a new one)
    act(() => {
      setter.call(input, "second")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // advance past the debounce so the second IPC call fires
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    expect(mockWorkspace).toHaveBeenCalledTimes(2)

    // resolve the second (newer) request first
    await act(async () => {
      resolveSecond(right({ results: freshResults, limitHit: false }))
      await Promise.resolve()
      await Promise.resolve()
    })

    // the panel should display the fresh results
    const freshHeaders = container.querySelectorAll('[data-testid="workspace-search-file-header"]')
    expect(freshHeaders.length).toBe(1)
    expect(freshHeaders[0].textContent).toContain("fresh.ts")

    // now resolve the first (stale) request — it should be discarded
    await act(async () => {
      resolveFirst(right({ results: staleResults, limitHit: false }))
      await Promise.resolve()
      await Promise.resolve()
    })

    // results should still show the fresh query, not the stale one
    const headersAfterStale = container.querySelectorAll(
      '[data-testid="workspace-search-file-header"]',
    )
    expect(headersAfterStale.length).toBe(1)
    expect(headersAfterStale[0].textContent).toContain("fresh.ts")
    // stale results must not appear
    expect(headersAfterStale[0].textContent).not.toContain("stale.ts")
  })

  it("whole word toggle button works", () => {
    store.set(searchWholeWordAtom, false)
    renderPanel()

    const toggle = container.querySelector(
      '[data-testid="workspace-search-whole-word-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(searchWholeWordAtom)).toBe(true)
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

describe("flattenResults", () => {
  it("strips workspace prefix and splits into fileName and dirPath", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/src/utils/helpers.ts",
        matches: [
          {
            lineNumber: 3,
            column: 0,
            lineContent: "export const foo = 1",
            matchStart: 0,
            matchEnd: 6,
          },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")
    const header = rows[0] as FlatRow & { kind: "file-header" }

    expect(header.kind).toBe("file-header")
    expect(header.fileName).toBe("helpers.ts")
    expect(header.dirPath).toBe("src/utils")
    expect(header.matchCount).toBe(1)
    expect(header.firstMatchLine).toBe(3)
  })

  it("handles root-level files with empty dirPath", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/readme.txt",
        matches: [
          { lineNumber: 1, column: 0, lineContent: "hello world", matchStart: 0, matchEnd: 5 },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")
    const header = rows[0] as FlatRow & { kind: "file-header" }

    expect(header.fileName).toBe("readme.txt")
    expect(header.dirPath).toBe("")
  })

  it("uses full path when file does not start with workspace prefix", () => {
    const results: SearchResult[] = [
      {
        file: "/other/location/file.ts",
        matches: [
          { lineNumber: 1, column: 0, lineContent: "const x = 1", matchStart: 6, matchEnd: 7 },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")
    const header = rows[0] as FlatRow & { kind: "file-header" }

    // the full path is used since it doesn't match the workspace prefix
    expect(header.fileName).toBe("file.ts")
    expect(header.dirPath).toBe("/other/location")
    // filePath always stores the original absolute path
    expect(header.filePath).toBe("/other/location/file.ts")
  })

  it("handles workspace path with trailing slash", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/src/index.ts",
        matches: [
          { lineNumber: 7, column: 4, lineContent: "import foo", matchStart: 7, matchEnd: 10 },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects/")
    const header = rows[0] as FlatRow & { kind: "file-header" }

    expect(header.fileName).toBe("index.ts")
    expect(header.dirPath).toBe("src")
  })

  it("handles workspace path without trailing slash", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/src/index.ts",
        matches: [
          { lineNumber: 7, column: 4, lineContent: "import foo", matchStart: 7, matchEnd: 10 },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")
    const header = rows[0] as FlatRow & { kind: "file-header" }

    expect(header.fileName).toBe("index.ts")
    expect(header.dirPath).toBe("src")
  })

  it("creates file-header rows followed by match rows for multiple files", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/src/components/button.tsx",
        matches: [
          {
            lineNumber: 10,
            column: 2,
            lineContent: "const label = 'click'",
            matchStart: 6,
            matchEnd: 11,
          },
          {
            lineNumber: 25,
            column: 0,
            lineContent: "export default button",
            matchStart: 15,
            matchEnd: 21,
          },
        ],
      },
      {
        file: "/home/user/projects/lib/deep/nested/config.ts",
        matches: [
          {
            lineNumber: 1,
            column: 0,
            lineContent: "export const config = {}",
            matchStart: 13,
            matchEnd: 19,
          },
        ],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")

    // 2 headers + 3 matches
    expect(rows).toHaveLength(5)

    // first file header
    const header1 = rows[0] as FlatRow & { kind: "file-header" }
    expect(header1.kind).toBe("file-header")
    expect(header1.fileName).toBe("button.tsx")
    expect(header1.dirPath).toBe("src/components")
    expect(header1.matchCount).toBe(2)
    expect(header1.firstMatchLine).toBe(10)

    // first file's matches
    const match1 = rows[1] as FlatRow & { kind: "match" }
    expect(match1.kind).toBe("match")
    expect(match1.filePath).toBe("/home/user/projects/src/components/button.tsx")
    expect(match1.lineNumber).toBe(10)
    expect(match1.lineContent).toBe("const label = 'click'")
    expect(match1.matchStart).toBe(6)
    expect(match1.matchEnd).toBe(11)

    const match2 = rows[2] as FlatRow & { kind: "match" }
    expect(match2.kind).toBe("match")
    expect(match2.lineNumber).toBe(25)

    // second file header
    const header2 = rows[3] as FlatRow & { kind: "file-header" }
    expect(header2.kind).toBe("file-header")
    expect(header2.fileName).toBe("config.ts")
    expect(header2.dirPath).toBe("lib/deep/nested")
    expect(header2.matchCount).toBe(1)

    // second file's match
    const match3 = rows[4] as FlatRow & { kind: "match" }
    expect(match3.kind).toBe("match")
    expect(match3.filePath).toBe("/home/user/projects/lib/deep/nested/config.ts")
    expect(match3.lineNumber).toBe(1)
  })

  it("creates file-header with matchCount 0 and firstMatchLine 1 for empty matches array", () => {
    const results: SearchResult[] = [
      {
        file: "/home/user/projects/src/empty.ts",
        matches: [],
      },
    ]

    const rows = flattenResults(results, "/home/user/projects")

    expect(rows).toHaveLength(1)
    const header = rows[0] as FlatRow & { kind: "file-header" }
    expect(header.kind).toBe("file-header")
    expect(header.fileName).toBe("empty.ts")
    expect(header.dirPath).toBe("src")
    expect(header.matchCount).toBe(0)
    // when matches is empty, firstMatchLine falls back to 1
    expect(header.firstMatchLine).toBe(1)
  })

  it("returns an empty array for empty results", () => {
    const rows = flattenResults([], "/home/user/projects")
    expect(rows).toEqual([])
  })
})
