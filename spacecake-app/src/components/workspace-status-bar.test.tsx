/**
 * @vitest-environment jsdom
 */
import { atom, createStore, Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceStatusBar } from "@/components/workspace-status-bar"
import { gitBranchAtom } from "@/lib/atoms/git"

// mock child components that aren't relevant to these tests
vi.mock("@/components/claude-status-badge", () => ({ ClaudeStatusBadge: () => null }))
vi.mock("@/components/claude-statusline-badge", () => ({ ClaudeStatuslineBadge: () => null }))
vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => null }))
vi.mock("@/components/watchman-badge", () => ({ WatchmanBadge: () => null }))
vi.mock("@/components/statusline-setup-prompt", () => ({
  statuslineConflictAtom: atom(null),
  useStatuslineAutoSetup: () => {},
}))

describe("WorkspaceStatusBar context menu", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    store.set(gitBranchAtom, "main")
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderStatusBar(props: Partial<React.ComponentProps<typeof WorkspaceStatusBar>> = {}) {
    act(() => {
      root.render(
        <Provider store={store}>
          <WorkspaceStatusBar
            onToggleTerminal={vi.fn()}
            onToggleTask={vi.fn()}
            onToggleGit={vi.fn()}
            isTerminalExpanded={false}
            isTaskExpanded={false}
            isGitExpanded={false}
            terminalDock="bottom"
            taskDock="bottom"
            gitDock="left"
            onTerminalDockChange={vi.fn()}
            onTaskDockChange={vi.fn()}
            onGitDockChange={vi.fn()}
            {...props}
          />
        </Provider>,
      )
    })
  }

  it("left-click toggles panel (no regression)", () => {
    const onToggleTerminal = vi.fn()
    renderStatusBar({ onToggleTerminal })

    const terminalButton = container.querySelector('[data-testid="statusbar-terminal-toggle"]')
    expect(terminalButton).not.toBeNull()

    act(() => {
      terminalButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
  })

  it("right-click opens context menu with dock position options", async () => {
    renderStatusBar({ terminalDock: "bottom" })

    const terminalButton = container.querySelector('[data-testid="statusbar-terminal-toggle"]')
    expect(terminalButton).not.toBeNull()

    // right-click triggers context menu via the radix ContextMenuTrigger
    await act(async () => {
      terminalButton!.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true }))
    })

    // the context menu renders in a portal; check the document body
    const menuItems = document.querySelectorAll('[data-slot="context-menu-item"]')
    const labels = Array.from(menuItems).map((el) => el.textContent?.trim())

    // current dock is "bottom", so "dock bottom" should be excluded
    expect(labels).toContain("dock left")
    expect(labels).toContain("dock right")
    expect(labels).not.toContain("dock bottom")
  })

  it("excludes current dock position from context menu", async () => {
    renderStatusBar({ gitDock: "right" })

    const gitButton = container.querySelector('button[aria-label="show git panel"]')
    expect(gitButton).not.toBeNull()

    await act(async () => {
      gitButton!.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true }))
    })

    const menuItems = document.querySelectorAll('[data-slot="context-menu-item"]')
    const labels = Array.from(menuItems).map((el) => el.textContent?.trim())

    expect(labels).toContain("dock left")
    expect(labels).toContain("dock bottom")
    expect(labels).not.toContain("dock right")
  })

  it("clicking a menu item calls onDockChange with the correct position", async () => {
    const onTerminalDockChange = vi.fn()
    renderStatusBar({ terminalDock: "bottom", onTerminalDockChange })

    const terminalButton = container.querySelector('[data-testid="statusbar-terminal-toggle"]')

    await act(async () => {
      terminalButton!.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true }))
    })

    const menuItems = document.querySelectorAll('[data-slot="context-menu-item"]')
    const leftItem = Array.from(menuItems).find((el) => el.textContent?.trim() === "dock left")
    expect(leftItem).toBeDefined()

    await act(async () => {
      leftItem!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onTerminalDockChange).toHaveBeenCalledWith("left")
  })
})
