import type {
  DockablePanelKind,
  DockPosition,
  FullDock,
  WorkspaceLayout,
} from "@/schema/workspace-layout"

// layout where every dock position is occupied
export type NormalizedWorkspaceLayout = Omit<WorkspaceLayout, "dock"> & { dock: FullDock }

// ============================================
// Actions
// ============================================

export type DockAction =
  | { kind: "move"; panel: DockablePanelKind; to: DockPosition }
  | { kind: "toggle"; panel: DockablePanelKind }
  | { kind: "expand"; panel: DockablePanelKind }
  | { kind: "collapse"; panel: DockablePanelKind }
  | { kind: "resize"; panel: DockablePanelKind; size: number }

// ============================================
// Query Helpers
// ============================================

/** Find which dock position a panel is assigned to, or null if not assigned. */
export function findPanel(layout: WorkspaceLayout, panel: DockablePanelKind): DockPosition | null {
  if (layout.dock.left === panel) return "left"
  if (layout.dock.right === panel) return "right"
  if (layout.dock.bottom === panel) return "bottom"
  return null
}

/** Find the first empty dock position, or null if all are occupied. */
export function findEmptyDock(layout: WorkspaceLayout): DockPosition | null {
  if (layout.dock.left === null) return "left"
  if (layout.dock.right === null) return "right"
  if (layout.dock.bottom === null) return "bottom"
  return null
}

// ============================================
// Normalization
// ============================================

const ALL_PANELS: DockablePanelKind[] = ["terminal", "task", "git"]
const ALL_POSITIONS: DockPosition[] = ["left", "right", "bottom"]

/**
 * Ensure every dockable panel is assigned to a dock position.
 * Older stored layouts may be missing "git" — this backfills
 * any missing panel into the first empty slot.
 */
export function normalizeDock(layout: WorkspaceLayout): NormalizedWorkspaceLayout {
  let dock = layout.dock
  let changed = false

  for (const panel of ALL_PANELS) {
    if (findPanel({ ...layout, dock }, panel) !== null) continue
    const emptySlot = ALL_POSITIONS.find((pos) => dock[pos] === null)
    if (!emptySlot) break
    dock = { ...dock, [emptySlot]: panel }
    changed = true
  }

  return (changed ? { ...layout, dock } : layout) as NormalizedWorkspaceLayout
}

/** Type-safe dock position lookup for normalized layouts. */
export function getDockPosition(dock: FullDock, panel: DockablePanelKind): DockPosition {
  if (dock.left === panel) return "left"
  if (dock.right === panel) return "right"
  return "bottom"
}

// ============================================
// Size Constraints
// ============================================

export const DOCK_SIZE_CONSTRAINTS: Record<DockPosition, { min: number; max: number }> = {
  bottom: { min: 10, max: 70 },
  left: { min: 10, max: 40 },
  right: { min: 10, max: 50 },
}

/** Clamp a panel's size to the constraints of its dock position. */
export function clampSize(size: number, position: DockPosition): number {
  const { min, max } = DOCK_SIZE_CONSTRAINTS[position]
  return Math.max(min, Math.min(max, size))
}

// ============================================
// Transition Function
// ============================================

export function transition(layout: WorkspaceLayout, action: DockAction): WorkspaceLayout {
  switch (action.kind) {
    case "move": {
      const { panel, to } = action
      const source = findPanel(layout, panel)
      // No-op: panel is already at the target
      if (source === to) return layout
      // No-op: panel not found in any dock
      if (source === null) return layout

      const targetPanel = layout.dock[to]
      // Swap: move the displaced panel to the source dock
      return {
        ...layout,
        dock: {
          ...layout.dock,
          [source]: targetPanel, // could be null or another panel
          [to]: panel,
        },
      }
    }

    case "toggle": {
      const { panel } = action
      return {
        ...layout,
        panels: {
          ...layout.panels,
          [panel]: {
            ...layout.panels[panel],
            isExpanded: !layout.panels[panel].isExpanded,
          },
        },
      }
    }

    case "expand": {
      const { panel } = action
      return {
        ...layout,
        panels: {
          ...layout.panels,
          [panel]: {
            ...layout.panels[panel],
            isExpanded: true,
          },
        },
      }
    }

    case "collapse": {
      const { panel } = action
      return {
        ...layout,
        panels: {
          ...layout.panels,
          [panel]: {
            ...layout.panels[panel],
            isExpanded: false,
          },
        },
      }
    }

    case "resize": {
      const { panel, size } = action
      return {
        ...layout,
        panels: {
          ...layout.panels,
          [panel]: {
            ...layout.panels[panel],
            size,
          },
        },
      }
    }
  }
}
