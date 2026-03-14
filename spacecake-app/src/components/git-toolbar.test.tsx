/**
 * @vitest-environment jsdom
 */
import { createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GitToolbar } from "@/components/git-toolbar"
import { gitRemoteStatusAtom } from "@/lib/atoms/git"
import { left, right, type Either } from "@/types/adt"
import type { ElectronAPI } from "@/types/electron"

vi.mock("@/components/branch-popover", () => ({ BranchPopover: () => null }))
vi.mock("@/components/dock-position-dropdown", () => ({ DockPositionDropdown: () => null }))

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: mockToast }))

type GitError = { _tag: "GitError"; description: string }

/** flush async mount effects (useEffect + async callbacks) */
const waitForEffects = () => act(() => new Promise((r) => setTimeout(r, 50)))

const TEST_WORKSPACE = "/test/workspace"

function createMockGitAPI(
  overrides: {
    fetch?: () => Promise<Either<GitError, void>>
    pull?: () => Promise<Either<GitError, void>>
    push?: () => Promise<Either<GitError, void>>
    getRemoteStatus?: () => Promise<
      Either<
        GitError,
        { ahead: number; behind: number; tracking: string | null; current: string | null }
      >
    >
  } = {},
) {
  const noop = vi.fn(async () => right<GitError, void>(undefined))

  return {
    fetch: overrides.fetch ? vi.fn(overrides.fetch) : noop,
    pull: overrides.pull ? vi.fn(overrides.pull) : noop,
    push: overrides.push ? vi.fn(overrides.push) : noop,
    getRemoteStatus: overrides.getRemoteStatus
      ? vi.fn(overrides.getRemoteStatus)
      : vi.fn(async () =>
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
  }
}

describe("GitToolbar", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

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

  function renderToolbar(
    gitApi: ReturnType<typeof createMockGitAPI>,
    props: {
      isExpanded?: boolean
      onExpandedChange?: (expanded: boolean) => void
      onDockChange?: (dock: "bottom" | "left" | "right") => void
    } = {},
  ) {
    window.electronAPI = {
      git: gitApi,
      onFileEvent: vi.fn(() => () => {}),
    } as unknown as ElectronAPI

    act(() => {
      root.render(
        <Provider store={store}>
          <GitToolbar
            workspacePath={TEST_WORKSPACE}
            isExpanded={props.isExpanded ?? true}
            dock="bottom"
            onExpandedChange={props.onExpandedChange ?? vi.fn()}
            onDockChange={props.onDockChange ?? vi.fn()}
          />
        </Provider>,
      )
    })
  }

  it("renders fetch/pull/push buttons", async () => {
    const gitApi = createMockGitAPI()
    renderToolbar(gitApi)
    await waitForEffects()

    expect(container.querySelector('[title="fetch"]')).not.toBeNull()
    expect(container.querySelector('[title="pull"]')).not.toBeNull()
    expect(container.querySelector('[title="push"]')).not.toBeNull()
  })

  it("fetch button calls electronAPI.git.fetch and refreshes remote status", async () => {
    const gitApi = createMockGitAPI()
    renderToolbar(gitApi)
    await waitForEffects()

    gitApi.getRemoteStatus.mockClear()

    const fetchBtn = container.querySelector('[title="fetch"]') as HTMLButtonElement
    await act(async () => {
      fetchBtn.click()
    })
    await waitForEffects()

    expect(gitApi.fetch).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(gitApi.getRemoteStatus).toHaveBeenCalled()
  })

  it("pull button calls electronAPI.git.pull and shows success toast", async () => {
    const gitApi = createMockGitAPI()
    renderToolbar(gitApi)
    await waitForEffects()

    const pullBtn = container.querySelector('[title="pull"]') as HTMLButtonElement
    await act(async () => {
      pullBtn.click()
    })
    await waitForEffects()

    expect(gitApi.pull).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(mockToast.success).toHaveBeenCalledWith("pulled")
  })

  it("push button calls electronAPI.git.push and shows success toast", async () => {
    const gitApi = createMockGitAPI()
    renderToolbar(gitApi)
    await waitForEffects()

    const pushBtn = container.querySelector('[title="push"]') as HTMLButtonElement
    await act(async () => {
      pushBtn.click()
    })
    await waitForEffects()

    expect(gitApi.push).toHaveBeenCalledWith(TEST_WORKSPACE)
    expect(mockToast.success).toHaveBeenCalledWith("pushed")
  })

  it("ahead/behind indicators render when remoteStatus has values", async () => {
    store.set(gitRemoteStatusAtom, { ahead: 3, behind: 2, tracking: "origin/main" })

    const gitApi = createMockGitAPI({
      getRemoteStatus: async () =>
        right({ ahead: 3, behind: 2, tracking: "origin/main", current: "main" }),
    })
    renderToolbar(gitApi)
    await waitForEffects()

    expect(container.querySelector('[data-testid="ahead-count"]')?.textContent).toBe("↑3")
    expect(container.querySelector('[data-testid="behind-count"]')?.textContent).toBe("↓2")
  })

  it("ahead/behind hidden when both are 0", async () => {
    store.set(gitRemoteStatusAtom, { ahead: 0, behind: 0, tracking: "origin/main" })

    const gitApi = createMockGitAPI()
    renderToolbar(gitApi)
    await waitForEffects()

    expect(container.querySelector('[data-testid="remote-indicators"]')).toBeNull()
  })

  it("error toast shown when operation fails", async () => {
    const gitApi = createMockGitAPI({
      fetch: async () => left({ _tag: "GitError", description: "network error" }),
    })
    renderToolbar(gitApi)
    await waitForEffects()

    const fetchBtn = container.querySelector('[title="fetch"]') as HTMLButtonElement
    await act(async () => {
      fetchBtn.click()
    })
    await waitForEffects()

    expect(mockToast.error).toHaveBeenCalledWith("network error", { description: undefined })
  })

  it("expand/collapse button toggles and calls onExpandedChange", async () => {
    const onExpandedChange = vi.fn()
    const gitApi = createMockGitAPI()
    renderToolbar(gitApi, { isExpanded: true, onExpandedChange })
    await waitForEffects()

    const collapseBtn = container.querySelector(
      '[aria-label="hide git panel"]',
    ) as HTMLButtonElement
    await act(async () => {
      collapseBtn.click()
    })
    await waitForEffects()

    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })
})
