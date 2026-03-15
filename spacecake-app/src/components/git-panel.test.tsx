/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import { useAtom } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GitPanel } from "@/components/git-panel"
import { Tabs } from "@/components/ui/tabs"
import type { GitCommit, GitPanelTab, GitStatus } from "@/lib/atoms/git"
import { gitPanelTabAtom } from "@/lib/atoms/git"
import { type Either, right } from "@/types/adt"
import type { ElectronAPI } from "@/types/electron"
import { AbsolutePath } from "@/types/workspace"

// mock useRoute hook and router - use vi.hoisted since vi.mock is hoisted
const { mockNavigate, getMockRouteValue, setMockRouteValue } = vi.hoisted(() => {
  let mockRouteValue: ReturnType<typeof import("@/hooks/use-route").useRoute> = null
  return {
    mockNavigate: vi.fn(),
    getMockRouteValue: () => mockRouteValue,
    setMockRouteValue: (value: typeof mockRouteValue) => {
      mockRouteValue = value
    },
  }
})

vi.mock("@/hooks/use-route", () => ({
  useRoute: () => getMockRouteValue(),
}))

vi.mock("@/router", () => ({
  router: {
    navigate: mockNavigate,
  },
}))

// bypass virtualization in jsdom (elements have zero dimensions)
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * opts.estimateSize(),
        size: opts.estimateSize(),
        key: i,
      })),
  }),
}))

type GitError = { _tag: "GitError"; description: string }
const gitRight = <T,>(value: T): Either<GitError, T> => right(value)

// react-resizable-panels needs ResizeObserver
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** flush async mount effects (useEffect + async callbacks) */
const waitForEffects = () => act(() => new Promise((r) => setTimeout(r, 50)))

function createMockGitAPI(
  overrides: {
    isGitRepo?: boolean
    status?: GitStatus
    commits?: GitCommit[]
  } = {},
) {
  const isGitRepo = vi.fn(async () => overrides.isGitRepo ?? true)
  const getStatus = vi.fn(async () =>
    gitRight(
      overrides.status ?? {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    ),
  )
  const getCommitLog = vi.fn(async () => gitRight(overrides.commits ?? []))

  const noop = vi.fn(async () => gitRight(undefined))

  return {
    api: {
      isGitRepo,
      getStatus,
      getCommitLog,
      getCurrentBranch: vi.fn(async () => "main"),
      getFileDiff: vi.fn(async () => gitRight({ oldContent: "", newContent: "" })),
      stage: noop,
      unstage: noop,
      commit: vi.fn(async () =>
        gitRight({
          hash: "abc1234",
          branch: "main",
          summary: { changes: 0, insertions: 0, deletions: 0 },
        }),
      ),
      listBranches: vi.fn(async () => gitRight({ current: "main", all: ["main"], branches: {} })),
      createBranch: noop,
      switchBranch: noop,
      deleteBranch: noop,
      push: noop,
      pull: noop,
      fetch: noop,
      getRemoteStatus: vi.fn(async () =>
        gitRight({ ahead: 0, behind: 0, tracking: null, current: "main" }),
      ),
      discardFile: noop,
      discardAll: noop,
    } satisfies ElectronAPI["git"],
  }
}

const TEST_WORKSPACE = AbsolutePath("/test/workspace")

function GitTabsWrapper({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useAtom(gitPanelTabAtom)
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as GitPanelTab)}>
      {children}
    </Tabs>
  )
}

describe("GitPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    setMockRouteValue(null)
    mockNavigate.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderPanel(
    gitApi: ReturnType<typeof createMockGitAPI>["api"],
    props?: {
      onFileClick?: (p: AbsolutePath) => void
      onCommitFileClick?: (p: AbsolutePath, hash: string) => void
    },
  ) {
    // attach mock to window
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI

    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel
              workspacePath={TEST_WORKSPACE}
              onFileClick={props?.onFileClick}
              onCommitFileClick={props?.onCommitFileClick}
            />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it('renders "no git repository found" when isGitRepo=false', async () => {
    const { api } = createMockGitAPI({ isGitRepo: false })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("no git repository found")
  })

  it("renders changes tab content by default", async () => {
    const { api } = createMockGitAPI({
      isGitRepo: true,
      status: { modified: [], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // changes tab content is visible by default
    expect(container.textContent).toContain("no changes")
  })

  it("changes tab is active by default", async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // the changes tab content should be visible (shows commit form or "no changes")
    expect(container.textContent).toContain("no changes")
  })

  it("does not call getStatus/getCommitLog again when file event fires on non-git workspace", async () => {
    const { api } = createMockGitAPI({ isGitRepo: false })

    // capture the file event callback
    let fileEventHandler: ((event: { path: string; kind: string }) => void) | undefined
    const mockOnFileEvent = vi.fn((cb: (event: { path: string; kind: string }) => void) => {
      fileEventHandler = cb
      return () => {}
    })

    window.electronAPI = {
      git: api,
      onFileEvent: mockOnFileEvent,
    } as unknown as ElectronAPI

    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
    await waitForEffects()

    // initial mount calls isGitRepo once
    expect(api.isGitRepo).toHaveBeenCalledTimes(1)
    expect(api.getStatus).not.toHaveBeenCalled()
    expect(api.getCommitLog).not.toHaveBeenCalled()

    // simulate a file event in the workspace
    api.isGitRepo.mockClear()
    await act(async () => {
      fileEventHandler?.({ path: `${TEST_WORKSPACE}/.git/HEAD`, kind: "contentChange" })
      // wait for debounce (300ms)
      await new Promise((r) => setTimeout(r, 400))
    })

    // should not have called isGitRepo again — ref-based guard prevents it
    expect(api.isGitRepo).not.toHaveBeenCalled()
    expect(api.getStatus).not.toHaveBeenCalled()
    expect(api.getCommitLog).not.toHaveBeenCalled()
  })

  it("calls isGitRepo and getStatus on mount (not getCommitLog)", async () => {
    const { api } = createMockGitAPI()
    renderPanel(api)
    await waitForEffects()

    expect(api.isGitRepo).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(api.getStatus).toHaveBeenCalledWith(TEST_WORKSPACE)
    // commit log is lazy-loaded only when history tab is opened
    expect(api.getCommitLog).not.toHaveBeenCalled()
  })

  it("calls getCommitLog when switching to history tab", async () => {
    const { api } = createMockGitAPI({
      commits: [
        {
          hash: "abc1234",
          message: "test commit",
          author: "test",
          date: new Date("2024-01-01"),
          files: [],
        },
      ],
    })
    renderPanel(api)
    await waitForEffects()

    expect(api.getCommitLog).not.toHaveBeenCalled()

    // switch to history tab via atom (radix triggers don't fire onValueChange reliably in jsdom)
    await act(async () => {
      store.set(gitPanelTabAtom, "history")
    })
    await waitForEffects()

    expect(api.getCommitLog).toHaveBeenCalledWith(TEST_WORKSPACE, 100)
  })

  it("onFileClick called with correct AbsolutePath", async () => {
    const onFileClick = vi.fn()
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/index.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api, { onFileClick })
    await waitForEffects()

    const fileBtn = Array.from(container.querySelectorAll('[role="button"]')).find((b) =>
      b.textContent?.includes("src/index.ts"),
    )
    expect(fileBtn).toBeDefined()
    ;(fileBtn as HTMLElement).click()

    expect(onFileClick).toHaveBeenCalledWith(AbsolutePath("/test/workspace/src/index.ts"))
  })

  it("onCommitFileClick called with AbsolutePath + hash", async () => {
    const onCommitFileClick = vi.fn()
    const { api } = createMockGitAPI({
      commits: [
        {
          hash: "abc1234def5678",
          message: "initial commit",
          author: "test",
          date: new Date("2024-01-01"),
          files: ["src/main.ts"],
        },
      ],
    })
    renderPanel(api, { onCommitFileClick })
    await waitForEffects()

    // switch to history tab via atom
    await act(async () => {
      store.set(gitPanelTabAtom, "history")
    })
    await waitForEffects()

    // the first commit is auto-selected, click the file
    const fileBtn = Array.from(container.querySelectorAll('[role="button"]')).find((b) =>
      b.textContent?.includes("src/main.ts"),
    )
    expect(fileBtn).toBeDefined()
    ;(fileBtn as HTMLElement).click()

    expect(onCommitFileClick).toHaveBeenCalledWith(
      AbsolutePath("/test/workspace/src/main.ts"),
      "abc1234def5678",
    )
  })

  it("navigates away from diff view when file is no longer in changes", async () => {
    // set up route as viewing a diff for a file
    setMockRouteValue({
      workspaceId: TEST_WORKSPACE,
      filePath: AbsolutePath("/test/workspace/src/removed.ts"),
      viewKind: "diff",
      fileType: "typescript",
    })

    // git status does NOT include the file we're viewing
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/other.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // should have navigated away from the diff view
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/w/$workspaceId/f/$filePath",
        search: {},
      }),
    )
  })

  it("does not navigate when diff file is still in changes", async () => {
    // set up route as viewing a diff for a file
    setMockRouteValue({
      workspaceId: TEST_WORKSPACE,
      filePath: AbsolutePath("/test/workspace/src/modified.ts"),
      viewKind: "diff",
      fileType: "typescript",
    })

    // git status DOES include the file we're viewing
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/modified.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // should NOT have navigated
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("does not navigate away from historical commit diff even when file not in working tree", async () => {
    // set up route as viewing a historical commit diff (has baseRef/targetRef)
    setMockRouteValue({
      workspaceId: TEST_WORKSPACE,
      filePath: AbsolutePath("/test/workspace/src/historical.ts"),
      viewKind: "diff",
      fileType: "typescript",
      baseRef: "abc1234^",
      targetRef: "abc1234",
    })

    // git status does NOT include this file (it's not in working tree changes)
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/other.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // should NOT have navigated - historical commit diffs are not affected by working tree status
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe("working tree files", () => {
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

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it('shows "no changes" when empty status', async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("no changes")
  })

  it("staged files show with A badge (green)", async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: ["new-file.ts"], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("changes")
    const aBadge = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "A" && s.classList.contains("text-green-500"),
    )
    expect(aBadge).toBeDefined()
    expect(aBadge!.title).toBe("added")
  })

  it("modified/untracked/deleted show M/U/D badges", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["mod.ts"],
        staged: [],
        untracked: ["new.ts"],
        deleted: ["gone.ts"],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("changes")

    // M badge (yellow)
    const mBadge = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "M" && s.classList.contains("text-yellow-500"),
    )
    expect(mBadge).toBeDefined()
    expect(mBadge!.title).toBe("modified")

    // U badge (blue)
    const uBadge = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "U" && s.classList.contains("text-blue-500"),
    )
    expect(uBadge).toBeDefined()
    expect(uBadge!.title).toBe("untracked")

    // D badge (red)
    const dBadge = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "D" && s.classList.contains("text-red-500"),
    )
    expect(dBadge).toBeDefined()
    expect(dBadge!.title).toBe("deleted")
  })

  it("both staged and unstaged files render in unified changes section", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["mod.ts"],
        staged: ["staged.ts"],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("changes")
    expect(container.textContent).toContain("mod.ts")
    expect(container.textContent).toContain("staged.ts")
  })
})

describe("commit files", () => {
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

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    // start on history tab for commit tests
    store.set(gitPanelTabAtom, "history")
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("shows files for selected commit (no status badges)", async () => {
    const { api } = createMockGitAPI({
      commits: [
        {
          hash: "abc1234",
          message: "test commit",
          author: "test",
          date: new Date("2024-01-01"),
          files: ["src/file.ts", "readme.md"],
        },
      ],
    })
    renderPanel(api)
    await waitForEffects()

    // first commit is auto-selected, files should be visible
    expect(container.textContent).toContain("src/file.ts")
    expect(container.textContent).toContain("readme.md")

    // no M/A/U/D status badges
    const statusBadges = Array.from(container.querySelectorAll("span")).filter(
      (s) =>
        (s.textContent === "M" ||
          s.textContent === "A" ||
          s.textContent === "U" ||
          s.textContent === "D") &&
        (s.classList.contains("text-yellow-500") ||
          s.classList.contains("text-green-500") ||
          s.classList.contains("text-blue-500") ||
          s.classList.contains("text-red-500")),
    )
    expect(statusBadges.length).toBe(0)
  })

  it('shows "no files" for empty commit', async () => {
    const { api } = createMockGitAPI({
      commits: [
        {
          hash: "abc1234",
          message: "empty commit",
          author: "test",
          date: new Date("2024-01-01"),
          files: [],
        },
      ],
    })
    renderPanel(api)
    await waitForEffects()

    // first commit auto-selected
    expect(container.textContent).toContain("no files")
  })
})

describe("commit selection", () => {
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

  const COMMITS: GitCommit[] = [
    {
      hash: "abc1234",
      message: "test commit",
      author: "test",
      date: new Date("2024-01-01"),
      files: ["committed.ts"],
    },
    {
      hash: "def5678",
      message: "second commit",
      author: "test",
      date: new Date("2024-01-02"),
      files: ["other.ts"],
    },
  ]

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    // start on history tab
    store.set(gitPanelTabAtom, "history")
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("first commit is auto-selected in history tab", async () => {
    const { api } = createMockGitAPI({ commits: COMMITS })
    renderPanel(api)
    await waitForEffects()

    // first commit should have bg-accent
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("test commit"),
    )
    expect(commitBtn).toBeDefined()
    expect(commitBtn!.classList.contains("bg-accent")).toBe(true)

    // its files should be visible
    expect(container.textContent).toContain("committed.ts")
  })

  it("clicking a different commit selects it", async () => {
    const { api } = createMockGitAPI({ commits: COMMITS })
    renderPanel(api)
    await waitForEffects()

    // click second commit
    const secondCommitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("second commit"),
    )
    await act(async () => {
      secondCommitBtn!.click()
    })
    await waitForEffects()

    expect(secondCommitBtn!.classList.contains("bg-accent")).toBe(true)
    expect(container.textContent).toContain("other.ts")
  })

  it("switching between changes and history tabs shows correct content", async () => {
    const { api } = createMockGitAPI({
      commits: COMMITS,
      status: {
        modified: ["dirty.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    // start on changes tab
    store.set(gitPanelTabAtom, "changes")

    window.electronAPI = {
      git: api,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
    await waitForEffects()

    // changes tab shows working tree files
    expect(container.textContent).toContain("dirty.ts")

    // switch to history via atom
    await act(async () => {
      store.set(gitPanelTabAtom, "history")
    })
    await waitForEffects()

    // history tab shows commits
    expect(container.textContent).toContain("test commit")
    expect(container.textContent).toContain("committed.ts")

    // switch back to changes via atom
    await act(async () => {
      store.set(gitPanelTabAtom, "changes")
    })
    await waitForEffects()

    // changes tab shows working tree again
    expect(container.textContent).toContain("dirty.ts")
  })
})

describe("ui-only inclusion state", () => {
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

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("all file checkboxes are checked by default (no git.stage called)", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts", "b.ts"],
        staged: [],
        untracked: ["c.ts"],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // file-level checkboxes have "include in commit" or "exclude from commit" labels
    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).filter((cb) => {
      const label = cb.getAttribute("aria-label") ?? ""
      return label === "include in commit" || label === "exclude from commit"
    })
    expect(checkboxes.length).toBe(3)
    expect(checkboxes.every((cb) => cb.checked)).toBe(true)

    // git.stage should never have been called
    expect(api.stage).not.toHaveBeenCalled()
  })

  it("toggling a checkbox does not call git.stage or git.unstage", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="exclude from commit"]',
    )
    expect(checkbox).toBeDefined()

    await act(async () => {
      checkbox!.click()
    })

    expect(api.stage).not.toHaveBeenCalled()
    expect(api.unstage).not.toHaveBeenCalled()
    expect(checkbox!.checked).toBe(false)
  })

  it("commit passes included files to the ipc call", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts", "b.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // uncheck b.ts — find the checkbox in the row containing "b.ts"
    const fileRows = Array.from(container.querySelectorAll('[role="button"]'))
    const bRow = fileRows.find((r) => r.textContent?.includes("b.ts"))
    const bCheckbox = bRow?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(bCheckbox).toBeDefined()
    await act(async () => {
      bCheckbox!.click()
    })

    // type commit message and submit
    const input = container.querySelector<HTMLInputElement>('input[placeholder="commit message"]')!
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!
      nativeInputValueSetter.call(input, "test commit")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await waitForEffects()

    const commitBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "commit",
    )
    expect(commitBtn).toBeDefined()
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    expect(api.commit).toHaveBeenCalledWith(
      TEST_WORKSPACE,
      "test commit",
      expect.objectContaining({ files: ["a.ts"] }),
    )
  })

  it("toggling header checkbox excludes/includes all files", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts", "b.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // find the header checkbox ("exclude all changes")
    const headerCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="exclude all changes"]',
    )
    expect(headerCheckbox).toBeDefined()

    // click to exclude all
    await act(async () => {
      headerCheckbox!.click()
    })

    // all file checkboxes should be unchecked
    const fileCheckboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).filter((cb) => {
      const label = cb.getAttribute("aria-label") ?? ""
      return label === "include in commit" || label === "exclude from commit"
    })
    expect(fileCheckboxes.every((cb) => !cb.checked)).toBe(true)

    // no staging ipc calls
    expect(api.stage).not.toHaveBeenCalled()
    expect(api.unstage).not.toHaveBeenCalled()
  })
})

describe("conflicted files", () => {
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

  function renderPanel(
    gitApi: ReturnType<typeof createMockGitAPI>["api"],
    props?: { onFileClick?: (p: AbsolutePath) => void },
  ) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} onFileClick={props?.onFileClick} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("renders conflicted files with C badge (orange) in merge conflicts section", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: ["src/conflict.ts"],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // merge conflicts section header
    expect(container.textContent).toContain("merge conflicts")

    // C badge (orange)
    const cBadge = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "C" && s.classList.contains("text-orange-500"),
    )
    expect(cBadge).toBeDefined()
    expect(cBadge!.title).toBe("conflicted")
  })

  it("renders conflicted files alongside changed files", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/modified.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: ["src/conflict.ts"],
      },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("merge conflicts")
    expect(container.textContent).toContain("src/conflict.ts")
    expect(container.textContent).toContain("changes")
    expect(container.textContent).toContain("src/modified.ts")
  })

  it("clicking a conflicted file calls onFileClick", async () => {
    const onFileClick = vi.fn()
    const { api } = createMockGitAPI({
      status: {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: ["src/conflict.ts"],
      },
    })
    renderPanel(api, { onFileClick })
    await waitForEffects()

    const fileBtn = Array.from(container.querySelectorAll('[role="button"]')).find((b) =>
      b.textContent?.includes("src/conflict.ts"),
    )
    expect(fileBtn).toBeDefined()
    ;(fileBtn as HTMLElement).click()

    expect(onFileClick).toHaveBeenCalledWith(AbsolutePath("/test/workspace/src/conflict.ts"))
  })

  it("does not show merge conflicts section when no conflicted files", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/file.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).not.toContain("merge conflicts")
  })
})

describe("discard confirmation", () => {
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

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("clicking discard button on a file opens confirmation dialog", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/file.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // hover-revealed discard button
    const discardBtn = container.querySelector(
      'button[aria-label="discard changes"]',
    ) as HTMLButtonElement
    expect(discardBtn).not.toBeNull()

    await act(async () => {
      discardBtn.click()
    })
    await waitForEffects()

    // dialog should appear with file name
    expect(document.body.textContent).toContain("discard changes")
    expect(document.body.textContent).toContain("src/file.ts")
    expect(document.body.textContent).toContain("this action cannot be undone")
  })

  it("confirming file discard calls electronAPI.git.discardFile", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/file.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // open discard dialog
    const discardBtn = container.querySelector(
      'button[aria-label="discard changes"]',
    ) as HTMLButtonElement
    await act(async () => {
      discardBtn.click()
    })
    await waitForEffects()

    // click "discard" in the dialog
    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "discard",
    )
    expect(confirmBtn).toBeDefined()
    await act(async () => {
      confirmBtn!.click()
    })
    await waitForEffects()

    expect(api.discardFile).toHaveBeenCalledWith(TEST_WORKSPACE, "src/file.ts")
  })

  it("cancelling discard dialog does not call discardFile", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["src/file.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // open discard dialog
    const discardBtn = container.querySelector(
      'button[aria-label="discard changes"]',
    ) as HTMLButtonElement
    await act(async () => {
      discardBtn.click()
    })
    await waitForEffects()

    // click "cancel"
    const cancelBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "cancel",
    )
    expect(cancelBtn).toBeDefined()
    await act(async () => {
      cancelBtn!.click()
    })
    await waitForEffects()

    expect(api.discardFile).not.toHaveBeenCalled()
  })

  it("discard all button opens confirmation dialog for all changes", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts", "b.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // "discard all changes" button in the changes section header
    const discardAllBtn = container.querySelector(
      'button[aria-label="discard all changes"]',
    ) as HTMLButtonElement
    expect(discardAllBtn).not.toBeNull()

    await act(async () => {
      discardAllBtn.click()
    })
    await waitForEffects()

    expect(document.body.textContent).toContain("discard all changes")
    expect(document.body.textContent).toContain("this action cannot be undone")
  })

  it("confirming discard all calls electronAPI.git.discardAll", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["a.ts", "b.ts"],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // open discard all dialog
    const discardAllBtn = container.querySelector(
      'button[aria-label="discard all changes"]',
    ) as HTMLButtonElement
    await act(async () => {
      discardAllBtn.click()
    })
    await waitForEffects()

    // confirm
    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "discard",
    )
    await act(async () => {
      confirmBtn!.click()
    })
    await waitForEffects()

    expect(api.discardAll).toHaveBeenCalledWith(TEST_WORKSPACE)
  })
})

describe("amend checkbox", () => {
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

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("amend checkbox is unchecked by default", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["a.ts"], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    const amendCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="amend last commit"]',
    )
    expect(amendCheckbox).not.toBeNull()
    expect(amendCheckbox!.checked).toBe(false)
  })

  it("commit with amend passes amend option to ipc call", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["a.ts"], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // check amend
    const amendCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="amend last commit"]',
    )
    await act(async () => {
      amendCheckbox!.click()
    })

    // type a message
    const input = container.querySelector<HTMLInputElement>('input[placeholder="commit message"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "amended commit")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await waitForEffects()

    // click commit
    const commitBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "commit",
    )
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    expect(api.commit).toHaveBeenCalledWith(
      TEST_WORKSPACE,
      "amended commit",
      expect.objectContaining({ amend: true }),
    )
  })

  it("amend without message is allowed (enables commit button)", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["a.ts"], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // check amend — no message typed
    const amendCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="amend last commit"]',
    )
    await act(async () => {
      amendCheckbox!.click()
    })
    await waitForEffects()

    // commit button should be enabled (amend allows empty message)
    const commitBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "commit",
    )
    expect(commitBtn).toBeDefined()
    expect(commitBtn!.disabled).toBe(false)
  })
})

describe("commit error handling", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
  }))

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    mockToast.success.mockClear()
    mockToast.error.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitTabsWrapper>
            <GitPanel workspacePath={TEST_WORKSPACE} />
          </GitTabsWrapper>
        </Provider>,
      )
    })
  }

  it("commit button is disabled when no files are included", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["a.ts"], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // type a message
    const input = container.querySelector<HTMLInputElement>('input[placeholder="commit message"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "test")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await waitForEffects()

    // exclude all files
    const headerCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="exclude all changes"]',
    )
    await act(async () => {
      headerCheckbox!.click()
    })
    await waitForEffects()

    // commit button should be disabled
    const commitBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "commit",
    )
    expect(commitBtn).toBeDefined()
    expect(commitBtn!.disabled).toBe(true)
  })

  it("commit button is disabled when message is empty and amend is not checked", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["a.ts"], staged: [], untracked: [], deleted: [], conflicted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    // no message typed, no amend
    const commitBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "commit",
    )
    expect(commitBtn).toBeDefined()
    expect(commitBtn!.disabled).toBe(true)
  })
})
