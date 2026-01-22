import { Schema } from "effect"

// ============================================
// Sum Types
// ============================================

export const DockPositionSchema = Schema.Literal("left", "right", "bottom")
export type DockPosition = typeof DockPositionSchema.Type

export const PanelKindSchema = Schema.Literal("terminal")
export type PanelKind = typeof PanelKindSchema.Type

// ============================================
// Dock
// ============================================

export const DockStateSchema = Schema.Struct({
  isExpanded: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  size: Schema.optionalWith(Schema.Number, { default: () => 20 }),
})
export type DockState = typeof DockStateSchema.Type

export const DockSchema = Schema.Struct({
  left: Schema.optionalWith(DockStateSchema, {
    default: () => ({ isExpanded: false, size: 15 }),
  }),
  right: Schema.optionalWith(DockStateSchema, {
    default: () => ({ isExpanded: false, size: 20 }),
  }),
  bottom: Schema.optionalWith(DockStateSchema, {
    default: () => ({ isExpanded: true, size: 30 }),
  }),
})
export type Dock = typeof DockSchema.Type

// ============================================
// Panel
// ============================================

export const PanelConfigSchema = Schema.Struct({
  dock: DockPositionSchema,
})
export type PanelConfig = typeof PanelConfigSchema.Type

export const PanelSchema = Schema.Struct({
  terminal: Schema.optionalWith(PanelConfigSchema, {
    default: () => ({ dock: "bottom" as const }),
  }),
})
export type Panel = typeof PanelSchema.Type

// ============================================
// Workspace Layout
// ============================================

export const WorkspaceLayoutSchema = Schema.Struct({
  dock: Schema.optionalWith(DockSchema, {
    default: () => ({
      left: { isExpanded: false, size: 15 },
      right: { isExpanded: false, size: 20 },
      bottom: { isExpanded: true, size: 30 },
    }),
  }),
  panel: Schema.optionalWith(PanelSchema, {
    default: () => ({
      terminal: { dock: "bottom" as const },
    }),
  }),
})
export type WorkspaceLayout = typeof WorkspaceLayoutSchema.Type

/**
 * Default workspace layout used when no layout exists.
 */
export const defaultWorkspaceLayout: WorkspaceLayout = {
  dock: {
    left: { isExpanded: false, size: 15 },
    right: { isExpanded: false, size: 20 },
    bottom: { isExpanded: true, size: 30 },
  },
  panel: {
    terminal: { dock: "bottom" },
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
    left: Schema.Struct({
      isExpanded: Schema.Boolean,
      size: Schema.Number,
    }),
    right: Schema.Struct({
      isExpanded: Schema.Boolean,
      size: Schema.Number,
    }),
    bottom: Schema.Struct({
      isExpanded: Schema.Boolean,
      size: Schema.Number,
    }),
  }),
  panel: Schema.Struct({
    terminal: Schema.Struct({
      dock: DockPositionSchema,
    }),
  }),
})
