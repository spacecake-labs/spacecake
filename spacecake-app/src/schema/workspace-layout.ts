import { Schema } from "effect"

// ============================================
// Sum Types
// ============================================

export const DockPositionSchema = Schema.Literal("left", "right", "bottom")
export type DockPosition = typeof DockPositionSchema.Type

export const PanelKindSchema = Schema.Literal("terminal", "task")
export type PanelKind = typeof PanelKindSchema.Type

// ============================================
// Dock
// ============================================

export const DockSchema = Schema.Struct({
  left: Schema.NullOr(PanelKindSchema),
  right: Schema.NullOr(PanelKindSchema),
  bottom: Schema.NullOr(PanelKindSchema),
})
export type Dock = typeof DockSchema.Type

// ============================================
// Panel
// ============================================

export const PanelStateSchema = Schema.Struct({
  isExpanded: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  size: Schema.optionalWith(Schema.Number, { default: () => 20 }),
})
export type PanelState = typeof PanelStateSchema.Type

export const PanelMapSchema = Schema.Struct({
  terminal: Schema.optionalWith(PanelStateSchema, {
    default: () => ({ isExpanded: true, size: 30 }),
  }),
  task: Schema.optionalWith(PanelStateSchema, {
    default: () => ({ isExpanded: false, size: 20 }),
  }),
})
export type PanelMap = typeof PanelMapSchema.Type

// ============================================
// Workspace Layout
// ============================================

export const WorkspaceLayoutSchema = Schema.Struct({
  dock: Schema.optionalWith(DockSchema, {
    default: () => ({
      left: null as PanelKind | null,
      right: "terminal" as const,
      bottom: "task" as const,
    }),
  }),
  panels: Schema.optionalWith(PanelMapSchema, {
    default: () => ({
      terminal: { isExpanded: true, size: 30 },
      task: { isExpanded: false, size: 20 },
    }),
  }),
})
export type WorkspaceLayout = typeof WorkspaceLayoutSchema.Type

/**
 * Default workspace layout used when no layout exists.
 */
export const defaultWorkspaceLayout: WorkspaceLayout = {
  dock: {
    left: null,
    right: "terminal",
    bottom: "task",
  },
  panels: {
    terminal: { isExpanded: true, size: 30 },
    task: { isExpanded: false, size: 20 },
  },
}

/**
 * Row schema for the workspace layout query result.
 */
export const WorkspaceLayoutRowSchema = Schema.Struct({
  layout: Schema.NullOr(Schema.Unknown),
})
export type WorkspaceLayoutRow = typeof WorkspaceLayoutRowSchema.Type

/**
 * Strict schema for storage - all fields required (no decoding optionality).
 * Used for drizzle insert/update operations.
 */
export const WorkspaceLayoutStrictSchema = Schema.Struct({
  dock: Schema.Struct({
    left: Schema.NullOr(PanelKindSchema),
    right: Schema.NullOr(PanelKindSchema),
    bottom: Schema.NullOr(PanelKindSchema),
  }),
  panels: Schema.Struct({
    terminal: Schema.Struct({
      isExpanded: Schema.Boolean,
      size: Schema.Number,
    }),
    task: Schema.Struct({
      isExpanded: Schema.Boolean,
      size: Schema.Number,
    }),
  }),
})
