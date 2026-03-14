/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BranchPopover } from "@/components/branch-popover"
import { branchDeleteStateAtom, gitBranchAtom, gitBranchListAtom } from "@/lib/atoms/git"
import { left, right } from "@/types/adt"
import type { ElectronAPI } from "@/types/electron"

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: mockToast }))

type GitError = { _tag: "GitError"; description: string }

function createMockGitAPI(
  overrides: Partial<{
    listBranches: ElectronAPI["git"]["listBranches"]
    switchBranch: ElectronAPI["git"]["switchBranch"]
    createBranch: ElectronAPI["git"]["createBranch"]
    deleteBranch: ElectronAPI["git"]["deleteBranch"]
  }> = {},
): ElectronAPI["git"] {
  const noop = vi.fn(async () => right<GitError, void>(undefined))

  return {
    isGitRepo: vi.fn(async () => true),
    getStatus: vi.fn(async () =>
      right<
        GitError,
        {
          modified: string[]
          staged: string[]
          untracked: string[]
          deleted: string[]
          conflicted: string[]
        }
      >({
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        conflicted: [],
      }),
    ),
    getCommitLog: vi.fn(async () => right<GitError, never[]>([])),
    getCurrentBranch: vi.fn(async () => "main"),
    getFileDiff: vi.fn(async () =>
      right<GitError, { oldContent: string; newContent: string }>({
        oldContent: "",
        newContent: "",
      }),
    ),
    stage: noop,
    unstage: noop,
    commit: vi.fn(async () =>
      right<
        GitError,
        {
          hash: string
          branch: string
          summary: { changes: number; insertions: number; deletions: number }
        }
      >({
        hash: "abc1234",
        branch: "main",
        summary: { changes: 0, insertions: 0, deletions: 0 },
      }),
    ),
    listBranches:
      overrides.listBranches ??
      vi.fn(async () =>
        right<GitError, { current: string; all: string[]; branches: Record<string, never> }>({
          current: "main",
          all: ["main", "dev", "feature"],
          branches: {},
        }),
      ),
    createBranch: overrides.createBranch ?? noop,
    switchBranch: overrides.switchBranch ?? noop,
    deleteBranch: overrides.deleteBranch ?? noop,
    push: noop,
    pull: noop,
    fetch: noop,
    getRemoteStatus: vi.fn(async () =>
      right<
        GitError,
        { ahead: number; behind: number; tracking: string | null; current: string | null }
      >({
        ahead: 0,
        behind: 0,
        tracking: null,
        current: "main",
      }),
    ),
    discardFile: noop,
    discardAll: noop,
  } satisfies ElectronAPI["git"]
}

const TEST_WORKSPACE = "/test/workspace"

/** flush async mount effects (useEffect + async callbacks) */
const waitForEffects = () => act(() => new Promise((r) => setTimeout(r, 50)))

/** query inside portalled popover content (radix renders outside the container) */
const q = (selector: string) => document.body.querySelector(selector)

describe("BranchPopover", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()

    store.set(gitBranchAtom, "main")
    store.set(gitBranchListAtom, ["main", "dev", "feature"])
    store.set(branchDeleteStateAtom, { isOpen: false })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    mockToast.success.mockClear()
    mockToast.error.mockClear()
  })

  function renderPopover(gitApi: ElectronAPI["git"] = createMockGitAPI(), isExpanded = true) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI

    act(() => {
      root.render(
        <Provider store={store}>
          <BranchPopover workspacePath={TEST_WORKSPACE} isExpanded={isExpanded} />
        </Provider>,
      )
    })
  }

  async function openPopover(gitApi?: ElectronAPI["git"]) {
    renderPopover(gitApi)
    await waitForEffects()

    const trigger = container.querySelector('button[title="switch branch"]') as HTMLButtonElement
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger.click()
    })
    await waitForEffects()
  }

  it("renders current branch name from gitBranchAtom", async () => {
    store.set(gitBranchAtom, "main")
    renderPopover()
    await waitForEffects()

    expect(container.textContent).toContain("main")
  })

  it("opens popover on click, shows branch list", async () => {
    await openPopover()

    const branchList = q('[data-testid="branch-list"]')
    expect(branchList).not.toBeNull()
    expect(branchList!.textContent).toContain("dev")
    expect(branchList!.textContent).toContain("feature")
  })

  it("clicking a branch calls electronAPI.git.switchBranch", async () => {
    const switchBranch = vi.fn(async () => right<GitError, void>(undefined))
    const api = createMockGitAPI({ switchBranch })
    await openPopover(api)

    const devBtn = q('[data-testid="branch-switch-dev"]') as HTMLButtonElement
    expect(devBtn).not.toBeNull()

    await act(async () => {
      devBtn.click()
    })
    await waitForEffects()

    expect(switchBranch).toHaveBeenCalledWith(TEST_WORKSPACE, "dev")
  })

  it("create branch: type name + click create calls createBranch", async () => {
    const createBranch = vi.fn(async () => right<GitError, void>(undefined))
    const api = createMockGitAPI({ createBranch })
    await openPopover(api)

    const input = q('[data-testid="new-branch-input"]') as HTMLInputElement
    expect(input).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(input, "new-branch")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await waitForEffects()

    const createBtn = q('[data-testid="create-branch-button"]') as HTMLButtonElement
    expect(createBtn).not.toBeNull()

    await act(async () => {
      createBtn.click()
    })
    await waitForEffects()

    expect(createBranch).toHaveBeenCalledWith(TEST_WORKSPACE, "new-branch")
  })

  it("create button is disabled when input is empty", async () => {
    await openPopover()

    const createBtn = q('[data-testid="create-branch-button"]') as HTMLButtonElement
    expect(createBtn).not.toBeNull()
    expect(createBtn.disabled).toBe(true)
  })

  it("current branch button is disabled", async () => {
    store.set(gitBranchAtom, "main")
    await openPopover()

    const mainBtn = q('[data-testid="branch-switch-main"]') as HTMLButtonElement
    expect(mainBtn).not.toBeNull()
    expect(mainBtn.disabled).toBe(true)
  })

  it("current branch has no delete button", async () => {
    store.set(gitBranchAtom, "main")
    await openPopover()

    // main should have no delete button, but non-current branches should
    expect(q('[data-testid="branch-delete-main"]')).toBeNull()
    expect(q('[data-testid="branch-delete-dev"]')).not.toBeNull()
    expect(q('[data-testid="branch-delete-feature"]')).not.toBeNull()
  })

  it("shows error toast on failed switchBranch", async () => {
    const switchBranch = vi.fn(async () =>
      left<GitError, void>({ _tag: "GitError", description: "branch error" }),
    )
    const api = createMockGitAPI({ switchBranch })
    await openPopover(api)

    const devBtn = q('[data-testid="branch-switch-dev"]') as HTMLButtonElement
    await act(async () => {
      devBtn.click()
    })
    await waitForEffects()

    expect(mockToast.error).toHaveBeenCalledWith("branch error")
  })
})
