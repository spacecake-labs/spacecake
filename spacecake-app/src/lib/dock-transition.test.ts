import { describe, expect, it } from "vitest"

import type {
  DockablePanelKind,
  DockPosition,
  FullDock,
  WorkspaceLayout,
} from "@/schema/workspace-layout"

import {
  clampSize,
  DOCK_SIZE_CONSTRAINTS,
  findEmptyDock,
  findPanel,
  getDockPosition,
  normalizeDock,
  transition,
} from "@/lib/dock-transition"

// ============================================
// Test Helpers
// ============================================

const PANELS: DockablePanelKind[] = ["terminal", "task", "git"]
const POSITIONS: DockPosition[] = ["left", "right", "bottom"]

function makeLayout(
  dock: Record<DockPosition, DockablePanelKind | null>,
  panels?: Partial<Record<DockablePanelKind, { isExpanded: boolean; size: number }>>,
): WorkspaceLayout {
  return {
    dock,
    panels: {
      terminal: { isExpanded: true, size: 30 },
      task: { isExpanded: false, size: 20 },
      git: { isExpanded: false, size: 25 },
      ...panels,
    },
  }
}

const defaultLayout = makeLayout({
  left: "git",
  right: "terminal",
  bottom: "task",
})

/** Assert that every panel occupies exactly one dock position with no duplicates. */
function assertBijection(layout: WorkspaceLayout) {
  const values = [layout.dock.left, layout.dock.right, layout.dock.bottom]
  const panels = values.filter((v): v is DockablePanelKind => v !== null)
  // no duplicate panels
  expect(new Set(panels).size).toBe(panels.length)
  // every panel is present
  for (const panel of PANELS) {
    expect(panels).toContain(panel)
  }
}

// ============================================
// findPanel
// ============================================

describe("findPanel", () => {
  it.each([
    {
      dock: { left: "terminal", right: "task", bottom: null },
      panel: "terminal",
      expected: "left",
    },
    {
      dock: { left: "terminal", right: "task", bottom: null },
      panel: "task",
      expected: "right",
    },
    {
      dock: { left: null, right: "task", bottom: "terminal" },
      panel: "terminal",
      expected: "bottom",
    },
    {
      dock: { left: "task", right: null, bottom: "terminal" },
      panel: "task",
      expected: "left",
    },
    {
      dock: { left: null, right: null, bottom: "terminal" },
      panel: "task",
      expected: null,
    },
  ] as {
    dock: Record<DockPosition, DockablePanelKind | null>
    panel: DockablePanelKind
    expected: DockPosition | null
  }[])("returns $expected for $panel with dock=$dock", ({ dock, panel, expected }) => {
    expect(findPanel(makeLayout(dock), panel)).toBe(expected)
  })
})

// ============================================
// getDockPosition
// ============================================

describe("getDockPosition", () => {
  const normalized = normalizeDock(defaultLayout)

  it.each(PANELS)("returns correct position for %s in default layout", (panel) => {
    const expected = findPanel(defaultLayout, panel)
    expect(getDockPosition(normalized.dock, panel)).toBe(expected)
  })

  it.each([
    { dock: { left: "git", right: "task", bottom: "terminal" }, panel: "git", expected: "left" },
    { dock: { left: "git", right: "task", bottom: "terminal" }, panel: "task", expected: "right" },
    {
      dock: { left: "git", right: "task", bottom: "terminal" },
      panel: "terminal",
      expected: "bottom",
    },
    { dock: { left: "task", right: "terminal", bottom: "git" }, panel: "git", expected: "bottom" },
  ] as {
    dock: FullDock
    panel: DockablePanelKind
    expected: DockPosition
  }[])("returns $expected for $panel", ({ dock, panel, expected }) => {
    expect(getDockPosition(dock, panel)).toBe(expected)
  })
})

// ============================================
// findEmptyDock
// ============================================

describe("findEmptyDock", () => {
  it.each([
    {
      dock: { left: null, right: "task", bottom: "terminal" },
      expected: "left",
    },
    {
      dock: { left: "task", right: null, bottom: "terminal" },
      expected: "right",
    },
    {
      dock: { left: "task", right: "terminal", bottom: null },
      expected: "bottom",
    },
    {
      dock: { left: "task", right: "terminal", bottom: "task" },
      expected: null,
    },
  ] as {
    dock: Record<DockPosition, DockablePanelKind | null>
    expected: DockPosition | null
  }[])("returns $expected for dock=$dock", ({ dock, expected }) => {
    expect(findEmptyDock(makeLayout(dock))).toBe(expected)
  })
})

// ============================================
// clampSize
// ============================================

describe("clampSize", () => {
  it.each(
    POSITIONS.flatMap((pos) => {
      const { min, max } = DOCK_SIZE_CONSTRAINTS[pos]
      const mid = Math.round((min + max) / 2)
      return [
        { pos, input: min - 5, expected: min, label: "below min" },
        { pos, input: max + 10, expected: max, label: "above max" },
        { pos, input: mid, expected: mid, label: "within range" },
      ]
    }),
  )("$pos: $label ($input -> $expected)", ({ pos, input, expected }) => {
    expect(clampSize(input, pos)).toBe(expected)
  })
})

// ============================================
// transition - move
// ============================================

describe("transition - move", () => {
  // generate all (panel, source, target) combinations
  const moveCases = PANELS.flatMap((panel) =>
    POSITIONS.flatMap((source) =>
      POSITIONS.filter((target) => target !== source).map((target) => ({
        panel,
        source,
        target,
      })),
    ),
  )

  describe("move swaps with occupant of target dock", () => {
    it.each(moveCases)("$panel: $source -> $target", ({ panel, source, target }) => {
      // build a full dock with panel at source
      const others = PANELS.filter((p) => p !== panel)
      const otherPositions = POSITIONS.filter((p) => p !== source)
      const dock = { left: null, right: null, bottom: null } as Record<
        DockPosition,
        DockablePanelKind | null
      >
      dock[source] = panel
      dock[otherPositions[0]] = others[0]
      dock[otherPositions[1]] = others[1]

      const layout = makeLayout(dock)
      const targetOccupant = layout.dock[target]
      const result = transition(layout, { kind: "move", panel, to: target })

      expect(result.dock[target]).toBe(panel)
      expect(result.dock[source]).toBe(targetOccupant)
      assertBijection(result)
    })
  })

  describe("no-op cases", () => {
    it.each(PANELS)("%s: move to same position returns same reference", (panel) => {
      const pos = findPanel(defaultLayout, panel)!
      const result = transition(defaultLayout, {
        kind: "move",
        panel,
        to: pos,
      })
      expect(result).toBe(defaultLayout)
    })
  })

  it("preserves panel state after move", () => {
    const layout = makeLayout(
      { left: "git", right: "task", bottom: "terminal" },
      {
        terminal: { isExpanded: true, size: 45 },
        task: { isExpanded: true, size: 25 },
      },
    )
    const result = transition(layout, {
      kind: "move",
      panel: "terminal",
      to: "right",
    })
    expect(result.panels.terminal).toEqual({ isExpanded: true, size: 45 })
    expect(result.panels.task).toEqual({ isExpanded: true, size: 25 })
  })
})

// ============================================
// transition - toggle / expand / collapse
// ============================================

describe("transition - expand/collapse/toggle", () => {
  const expandedCases = PANELS.flatMap((panel) =>
    [true, false].map((isExpanded) => ({ panel, isExpanded })),
  )

  describe("toggle", () => {
    it.each(expandedCases)(
      "$panel (isExpanded=$isExpanded) -> toggled",
      ({ panel, isExpanded }) => {
        const layout = makeLayout(defaultLayout.dock, {
          [panel]: { isExpanded, size: 25 },
        })
        const result = transition(layout, { kind: "toggle", panel })
        expect(result.panels[panel].isExpanded).toBe(!isExpanded)
        expect(result.panels[panel].size).toBe(25)
      },
    )
  })

  describe("expand", () => {
    it.each(expandedCases)(
      "$panel (isExpanded=$isExpanded) -> expanded",
      ({ panel, isExpanded }) => {
        const layout = makeLayout(defaultLayout.dock, {
          [panel]: { isExpanded, size: 25 },
        })
        const result = transition(layout, { kind: "expand", panel })
        expect(result.panels[panel].isExpanded).toBe(true)
        expect(result.panels[panel].size).toBe(25)
      },
    )
  })

  describe("collapse", () => {
    it.each(expandedCases)(
      "$panel (isExpanded=$isExpanded) -> collapsed",
      ({ panel, isExpanded }) => {
        const layout = makeLayout(defaultLayout.dock, {
          [panel]: { isExpanded, size: 25 },
        })
        const result = transition(layout, { kind: "collapse", panel })
        expect(result.panels[panel].isExpanded).toBe(false)
        expect(result.panels[panel].size).toBe(25)
      },
    )
  })

  it.each(PANELS)("%s: toggle/expand/collapse does not affect dock", (panel) => {
    for (const kind of ["toggle", "expand", "collapse"] as const) {
      const result = transition(defaultLayout, { kind, panel })
      expect(result.dock).toEqual(defaultLayout.dock)
    }
  })

  it.each(PANELS)("%s: toggle/expand/collapse does not affect other panels", (panel) => {
    const otherPanels = PANELS.filter((p) => p !== panel)
    for (const kind of ["toggle", "expand", "collapse"] as const) {
      const result = transition(defaultLayout, { kind, panel })
      for (const other of otherPanels) {
        expect(result.panels[other]).toEqual(defaultLayout.panels[other])
      }
    }
  })
})

// ============================================
// transition - resize
// ============================================

describe("transition - resize", () => {
  it.each(PANELS)("%s: updates size, preserves isExpanded", (panel) => {
    const result = transition(defaultLayout, {
      kind: "resize",
      panel,
      size: 42,
    })
    expect(result.panels[panel].size).toBe(42)
    expect(result.panels[panel].isExpanded).toBe(defaultLayout.panels[panel].isExpanded)
  })

  it.each(PANELS)("%s: resize does not affect dock or other panels", (panel) => {
    const otherPanels = PANELS.filter((p) => p !== panel)
    const result = transition(defaultLayout, {
      kind: "resize",
      panel,
      size: 42,
    })
    expect(result.dock).toEqual(defaultLayout.dock)
    for (const other of otherPanels) {
      expect(result.panels[other]).toEqual(defaultLayout.panels[other])
    }
  })
})

// ============================================
// Bijection invariant across action sequences
// ============================================

describe("bijection invariant", () => {
  it("holds after all single-step moves from default layout", () => {
    for (const panel of PANELS) {
      for (const to of POSITIONS) {
        const result = transition(defaultLayout, { kind: "move", panel, to })
        assertBijection(result)
      }
    }
  })

  it("holds after chained moves through all positions", () => {
    let layout = defaultLayout
    for (const panel of PANELS) {
      for (const to of POSITIONS) {
        layout = transition(layout, { kind: "move", panel, to })
        assertBijection(layout)
      }
    }
  })

  it("holds after interleaved move + toggle + resize", () => {
    let layout = defaultLayout
    layout = transition(layout, {
      kind: "move",
      panel: "terminal",
      to: "right",
    })
    layout = transition(layout, { kind: "toggle", panel: "terminal" })
    layout = transition(layout, { kind: "resize", panel: "task", size: 35 })
    layout = transition(layout, { kind: "move", panel: "task", to: "left" })
    layout = transition(layout, { kind: "expand", panel: "task" })
    layout = transition(layout, {
      kind: "move",
      panel: "terminal",
      to: "bottom",
    })
    assertBijection(layout)
    expect(layout.panels.terminal.isExpanded).toBe(false)
    expect(layout.panels.task.isExpanded).toBe(true)
    expect(layout.panels.task.size).toBe(35)
  })
})

// ============================================
// normalizeDock
// ============================================

describe("normalizeDock", () => {
  it("returns same reference when all panels are already assigned", () => {
    const layout = makeLayout({ left: "git", right: "terminal", bottom: "task" })
    expect(normalizeDock(layout)).toBe(layout)
  })

  it("backfills git into the empty slot (legacy 2-panel layout)", () => {
    const layout = makeLayout({ left: null, right: "terminal", bottom: "task" })
    const result = normalizeDock(layout)
    expect(result.dock).toEqual({ left: "git", right: "terminal", bottom: "task" })
    assertBijection(result)
  })

  it("backfills git when empty slot is right", () => {
    const layout = makeLayout({ left: "task", right: null, bottom: "terminal" })
    const result = normalizeDock(layout)
    expect(result.dock).toEqual({ left: "task", right: "git", bottom: "terminal" })
    assertBijection(result)
  })

  it("backfills git when empty slot is bottom", () => {
    const layout = makeLayout({ left: "terminal", right: "task", bottom: null })
    const result = normalizeDock(layout)
    expect(result.dock).toEqual({ left: "terminal", right: "task", bottom: "git" })
    assertBijection(result)
  })

  it("preserves panel state during normalization", () => {
    const layout = makeLayout(
      { left: null, right: "terminal", bottom: "task" },
      { git: { isExpanded: true, size: 30 } },
    )
    const result = normalizeDock(layout)
    expect(result.panels.git).toEqual({ isExpanded: true, size: 30 })
  })
})
