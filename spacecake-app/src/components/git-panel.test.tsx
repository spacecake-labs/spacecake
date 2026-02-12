/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GitCommit, GitStatus } from "@/lib/atoms/git"
import type { ElectronAPI } from "@/types/electron"

import { GitPanel } from "@/components/git-panel"
import { type Either, right } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

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

type GitChangeListener = (data: { workspacePath: string; filePath: string }) => void

function createMockGitAPI(
  overrides: {
    isGitRepo?: boolean
    status?: GitStatus
    commits?: GitCommit[]
  } = {},
) {
  const listeners = new Set<GitChangeListener>()

  const isGitRepo = vi.fn(async () => overrides.isGitRepo ?? true)
  const getStatus = vi.fn(async () =>
    gitRight(
      overrides.status ?? {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
      },
    ),
  )
  const getCommitLog = vi.fn(async () => gitRight(overrides.commits ?? []))
  const onGitChange = vi.fn((cb: GitChangeListener) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  })

  return {
    api: {
      isGitRepo,
      getStatus,
      getCommitLog,
      onGitChange,
      getCurrentBranch: vi.fn(async () => "main"),
      startWatching: vi.fn(async () => gitRight(undefined)),
      stopWatching: vi.fn(async () => gitRight(undefined)),
      getFileDiff: vi.fn(async () => gitRight({ oldContent: "", newContent: "" })),
    } satisfies ElectronAPI["git"],
    listeners,
    _simulateGitChange: (workspacePath: string) => {
      for (const cb of listeners) {
        cb({ workspacePath, filePath: "" })
      }
    },
  }
}

const TEST_WORKSPACE = AbsolutePath("/test/workspace")

describe("GitPanel", () => {
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
    props?: {
      onFileClick?: (p: AbsolutePath) => void
      onCommitFileClick?: (p: AbsolutePath, hash: string) => void
    },
  ) {
    // attach mock to window
    window.electronAPI = { git: gitApi } as unknown as ElectronAPI

    act(() => {
      root.render(
        <Provider store={store}>
          <GitPanel
            workspacePath={TEST_WORKSPACE}
            onFileClick={props?.onFileClick}
            onCommitFileClick={props?.onCommitFileClick}
          />
        </Provider>,
      )
    })
  }

  it('renders "no git repository found" when isGitRepo=false', async () => {
    const { api } = createMockGitAPI({ isGitRepo: false })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("no git repository found")
    // no resizable layout
    expect(container.querySelector("[data-panel-group-id]")).toBeNull()
  })

  it("renders 2-pane layout when isGitRepo=true", async () => {
    const { api } = createMockGitAPI({ isGitRepo: true })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("commits")
    expect(container.textContent).toContain("changed files")
  })

  it('"working tree" selected by default', async () => {
    const { api } = createMockGitAPI()
    renderPanel(api)
    await waitForEffects()

    const workingTreeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("working tree"),
    )
    expect(workingTreeBtn).toBeDefined()
    expect(workingTreeBtn!.className).toContain("bg-accent")
  })

  it("calls isGitRepo, getStatus, getCommitLog on mount", async () => {
    const { api } = createMockGitAPI()
    renderPanel(api)
    await waitForEffects()

    expect(api.isGitRepo).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(api.getStatus).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(api.getCommitLog).toHaveBeenCalledWith(TEST_WORKSPACE, 20)
  })

  it("subscribes to onGitChange; unsubscribes on unmount", async () => {
    const { api, listeners } = createMockGitAPI()
    renderPanel(api)
    await waitForEffects()

    expect(listeners.size).toBe(1)

    // unmount
    act(() => root.unmount())
    expect(listeners.size).toBe(0)
  })

  it("yellow dot when changes exist", async () => {
    const { api } = createMockGitAPI({
      status: { modified: ["src/index.ts"], staged: [], untracked: [], deleted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    const allSvgs = Array.from(container.querySelectorAll("svg"))
    const hasYellow = allSvgs.some(
      (svg) => svg.classList.contains("fill-yellow-500") || svg.closest(".fill-yellow-500"),
    )
    expect(hasYellow).toBe(true)
  })

  it("gray dot when no changes", async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: [], untracked: [], deleted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    const allSvgs = Array.from(container.querySelectorAll("svg"))
    const hasYellow = allSvgs.some((svg) => svg.classList.contains("fill-yellow-500"))
    expect(hasYellow).toBe(false)

    const hasMuted = allSvgs.some((svg) => svg.classList.contains("text-muted-foreground"))
    expect(hasMuted).toBe(true)
  })

  it("onFileClick called with correct AbsolutePath", async () => {
    const onFileClick = vi.fn()
    const { api } = createMockGitAPI({
      status: { modified: ["src/index.ts"], staged: [], untracked: [], deleted: [] },
    })
    renderPanel(api, { onFileClick })
    await waitForEffects()

    const fileBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("src/index.ts"),
    )
    expect(fileBtn).toBeDefined()
    fileBtn!.click()

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

    // select the commit
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("initial commit"),
    )
    expect(commitBtn).toBeDefined()
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    // click the file in the commit
    const fileBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("src/main.ts"),
    )
    expect(fileBtn).toBeDefined()
    fileBtn!.click()

    expect(onCommitFileClick).toHaveBeenCalledWith(
      AbsolutePath("/test/workspace/src/main.ts"),
      "abc1234def5678",
    )
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
    window.electronAPI = { git: gitApi } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitPanel workspacePath={TEST_WORKSPACE} />
        </Provider>,
      )
    })
  }

  it('shows "no changes" when empty status', async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: [], untracked: [], deleted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("no changes")
  })

  it("staged files show with A badge (green)", async () => {
    const { api } = createMockGitAPI({
      status: { modified: [], staged: ["new-file.ts"], untracked: [], deleted: [] },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("staged changes")
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

  it("both sections render when both exist", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["mod.ts"],
        staged: ["staged.ts"],
        untracked: [],
        deleted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    expect(container.textContent).toContain("staged changes")
    expect(container.textContent).toContain("changes")
  })

  it("sections collapse/expand on click", async () => {
    const { api } = createMockGitAPI({
      status: {
        modified: ["mod.ts"],
        staged: [],
        untracked: [],
        deleted: [],
      },
    })
    renderPanel(api)
    await waitForEffects()

    // find the collapsible trigger for "changes"
    const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("changes"),
    )
    expect(trigger).toBeDefined()

    // content should start open
    const collapsibleContent = container.querySelector('[data-state="open"]')
    expect(collapsibleContent).not.toBeNull()

    // click to collapse
    await act(async () => {
      trigger!.click()
    })

    const closedContent = container.querySelector('[data-state="closed"]')
    expect(closedContent).not.toBeNull()

    // click to re-expand
    await act(async () => {
      trigger!.click()
    })

    const reopenedContent = container.querySelector('[data-state="open"]')
    expect(reopenedContent).not.toBeNull()
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
    window.electronAPI = { git: gitApi } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitPanel workspacePath={TEST_WORKSPACE} />
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

    // select the commit
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("test commit"),
    )
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    // files should be visible
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

    // select the commit
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("empty commit"),
    )
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

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

  const DIRTY_STATUS: GitStatus = {
    modified: ["dirty.ts"],
    staged: [],
    untracked: [],
    deleted: [],
  }

  const COMMITS: GitCommit[] = [
    {
      hash: "abc1234",
      message: "test commit",
      author: "test",
      date: new Date("2024-01-01"),
      files: ["committed.ts"],
    },
  ]

  function renderPanel(gitApi: ReturnType<typeof createMockGitAPI>["api"]) {
    window.electronAPI = { git: gitApi } as unknown as ElectronAPI
    act(() => {
      root.render(
        <Provider store={store}>
          <GitPanel workspacePath={TEST_WORKSPACE} />
        </Provider>,
      )
    })
  }

  it("clicking commit selects it (bg-accent)", async () => {
    const { api } = createMockGitAPI({ commits: COMMITS, status: DIRTY_STATUS })
    renderPanel(api)
    await waitForEffects()

    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("test commit"),
    )
    expect(commitBtn).toBeDefined()

    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    // commit button should have bg-accent class
    expect(commitBtn!.classList.contains("bg-accent")).toBe(true)

    // working tree should lose bg-accent class (hover:bg-accent doesn't count)
    const workingTreeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("working tree"),
    )
    expect(workingTreeBtn!.classList.contains("bg-accent")).toBe(false)
  })

  it('clicking "working tree" returns to working tree view', async () => {
    const { api } = createMockGitAPI({ commits: COMMITS, status: DIRTY_STATUS })
    renderPanel(api)
    await waitForEffects()

    // select commit first
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("test commit"),
    )
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()

    // verify commit files
    expect(container.textContent).toContain("committed.ts")

    // click working tree
    const workingTreeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("working tree"),
    )
    await act(async () => {
      workingTreeBtn!.click()
    })
    await waitForEffects()

    // should show working tree files
    expect(container.textContent).toContain("dirty.ts")
  })

  it("right pane updates when selection changes", async () => {
    const { api } = createMockGitAPI({ commits: COMMITS, status: DIRTY_STATUS })
    renderPanel(api)
    await waitForEffects()

    // working tree: dirty.ts
    expect(container.textContent).toContain("dirty.ts")

    // select commit: committed.ts
    const commitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("test commit"),
    )
    await act(async () => {
      commitBtn!.click()
    })
    await waitForEffects()
    expect(container.textContent).toContain("committed.ts")

    // back to working tree
    const workingTreeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("working tree"),
    )
    await act(async () => {
      workingTreeBtn!.click()
    })
    await waitForEffects()
    expect(container.textContent).toContain("dirty.ts")
  })
})
