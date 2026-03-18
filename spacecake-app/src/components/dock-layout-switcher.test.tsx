/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DockLayoutEditor } from "@/components/dock-layout-switcher"
import type { DockPosition } from "@/schema/workspace-layout"

// ============================================
// helpers
// ============================================

function makeProps(overrides: Partial<Parameters<typeof DockLayoutEditor>[0]> = {}) {
  return {
    terminalDock: "right" as DockPosition,
    taskDock: "bottom" as DockPosition,
    gitDock: "left" as DockPosition,
    isTerminalExpanded: true,
    isTaskExpanded: false,
    isGitExpanded: false,
    onTerminalDockChange: vi.fn(),
    onTaskDockChange: vi.fn(),
    onGitDockChange: vi.fn(),
    onToggleTerminal: vi.fn(),
    onToggleTask: vi.fn(),
    onToggleGit: vi.fn(),
    ...overrides,
  }
}

/** find the panel list container (the section with rows, not the minimap) */
function getPanelList(container: HTMLElement): HTMLElement {
  const headings = Array.from(container.querySelectorAll("div"))
  const panelsHeading = headings.find((d) => d.textContent?.trim() === "panels")
  // the panel rows are the next sibling
  return panelsHeading!.nextElementSibling as HTMLElement
}

/** find a panel row by its label text (searches only in the panel list, not the minimap) */
function findPanelRow(container: HTMLElement, label: string): HTMLElement | null {
  const list = getPanelList(container)
  const spans = Array.from(list.querySelectorAll("span"))
  const labelSpan = spans.find((s) => s.textContent === label)
  return labelSpan?.closest("[class*='cursor-pointer']") as HTMLElement | null
}

/** find the visibility toggle button inside a panel row */
function findToggleButton(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector("button[aria-label]") as HTMLButtonElement | null
}

/** find a dock position badge inside a panel row */
function findDockBadge(row: HTMLElement): string | null {
  const badges = Array.from(row.querySelectorAll("span"))
  const badge = badges.find((s) => s.className.includes("bg-muted"))
  return badge?.textContent ?? null
}

/** find the instruction text */
function getInstructionText(container: HTMLElement): string | null {
  const p = container.querySelector("p")
  return p?.textContent ?? null
}

/** find the restore defaults button */
function findRestoreButton(container: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll("button"))
  return (buttons.find((b) => b.textContent?.includes("restore defaults")) ??
    null) as HTMLButtonElement | null
}

/** find a dock drop target by its label text (shown when empty or occupied) */
function findDropDock(container: HTMLElement, label: string): HTMLElement | null {
  const spans = Array.from(container.querySelectorAll("span"))
  const match = spans.find((s) => s.textContent === label)
  // walk up to the clickable div
  return match?.closest("div[class*='border-dashed']") as HTMLElement | null
}

// ============================================
// test setup
// ============================================

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// ============================================
// rendering
// ============================================

describe("rendering", () => {
  it("renders all three panel rows", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    expect(findPanelRow(container, "git")).not.toBeNull()
    expect(findPanelRow(container, "terminal")).not.toBeNull()
    expect(findPanelRow(container, "tasks")).not.toBeNull()
  })

  it("shows correct dock position labels", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const gitRow = findPanelRow(container, "git")!
    const terminalRow = findPanelRow(container, "terminal")!
    const taskRow = findPanelRow(container, "tasks")!

    expect(findDockBadge(gitRow)).toBe("left")
    expect(findDockBadge(terminalRow)).toBe("right")
    expect(findDockBadge(taskRow)).toBe("bottom")
  })

  it("shows default instruction text when no panel is selected", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
  })

  it("shows correct aria-label for expanded panel toggle", () => {
    const props = makeProps({ isTerminalExpanded: true })
    act(() => root.render(<DockLayoutEditor {...props} />))

    const row = findPanelRow(container, "terminal")!
    const btn = findToggleButton(row)!
    expect(btn.getAttribute("aria-label")).toBe("hide terminal")
  })

  it("shows correct aria-label for collapsed panel toggle", () => {
    const props = makeProps({ isGitExpanded: false })
    act(() => root.render(<DockLayoutEditor {...props} />))

    const row = findPanelRow(container, "git")!
    const btn = findToggleButton(row)!
    expect(btn.getAttribute("aria-label")).toBe("show git")
  })
})

// ============================================
// panel selection
// ============================================

describe("panel selection", () => {
  it("clicking a panel updates instruction text", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())

    expect(getInstructionText(container)).toBe("select a new dock position for the git panel")
  })

  it("clicking a selected panel deselects it", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())
    act(() => gitRow.click())

    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
  })

  it("clicking a different panel switches selection", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())

    const terminalRow = findPanelRow(container, "terminal")!
    act(() => terminalRow.click())

    expect(getInstructionText(container)).toBe("select a new dock position for the terminal panel")
  })
})

// ============================================
// dock click interactions
// ============================================

describe("dock click", () => {
  it("clicking a dock with no selection selects the occupant panel", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    // click the left dock (occupied by git)
    const leftDock = findDropDock(container, "git")!
    act(() => leftDock.click())

    expect(getInstructionText(container)).toBe("select a new dock position for the git panel")
  })

  it("clicking the dock where the selected panel already is deselects it", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    // select git panel
    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())

    // click the left dock (where git already is)
    const leftDock = findDropDock(container, "git")!
    act(() => leftDock.click())

    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
  })

  it("clicking a different dock moves the selected panel there", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    // select git (currently at left)
    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())

    // click the right dock (occupied by terminal) to move git there
    const rightDock = findDropDock(container, "terminal")!
    act(() => rightDock.click())

    // git should have been moved to right
    expect(props.onGitDockChange).toHaveBeenCalledWith("right")
    // selection should be cleared
    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
  })
})

// ============================================
// visibility toggle
// ============================================

describe("visibility toggle", () => {
  it("clicking the eye button calls the correct toggle callback", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const gitRow = findPanelRow(container, "git")!
    const toggleBtn = findToggleButton(gitRow)!
    act(() => toggleBtn.click())

    expect(props.onToggleGit).toHaveBeenCalledOnce()
  })

  it("toggle click does not also select the panel", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const terminalRow = findPanelRow(container, "terminal")!
    const toggleBtn = findToggleButton(terminalRow)!
    act(() => toggleBtn.click())

    // instruction text should still show default (no selection)
    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
    expect(props.onToggleTerminal).toHaveBeenCalledOnce()
  })

  it("calls the correct toggle for each panel", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    const taskRow = findPanelRow(container, "tasks")!
    act(() => findToggleButton(taskRow)!.click())
    expect(props.onToggleTask).toHaveBeenCalledOnce()

    const terminalRow = findPanelRow(container, "terminal")!
    act(() => findToggleButton(terminalRow)!.click())
    expect(props.onToggleTerminal).toHaveBeenCalledOnce()

    const gitRow = findPanelRow(container, "git")!
    act(() => findToggleButton(gitRow)!.click())
    expect(props.onToggleGit).toHaveBeenCalledOnce()
  })
})

// ============================================
// restore defaults
// ============================================

describe("restore defaults", () => {
  it("calls all three dock change callbacks with default positions", () => {
    const props = makeProps({
      terminalDock: "left",
      taskDock: "right",
      gitDock: "bottom",
    })
    act(() => root.render(<DockLayoutEditor {...props} />))

    const restoreBtn = findRestoreButton(container)!
    act(() => restoreBtn.click())

    // default layout: git=left, terminal=right, task=bottom
    expect(props.onGitDockChange).toHaveBeenCalledWith("left")
    expect(props.onTerminalDockChange).toHaveBeenCalledWith("right")
    expect(props.onTaskDockChange).toHaveBeenCalledWith("bottom")
  })

  it("clears selection after restoring defaults", () => {
    const props = makeProps()
    act(() => root.render(<DockLayoutEditor {...props} />))

    // select a panel first
    const gitRow = findPanelRow(container, "git")!
    act(() => gitRow.click())
    expect(getInstructionText(container)).toContain("git")

    // restore defaults
    const restoreBtn = findRestoreButton(container)!
    act(() => restoreBtn.click())

    expect(getInstructionText(container)).toBe("click a panel, then choose where to dock it")
  })
})
