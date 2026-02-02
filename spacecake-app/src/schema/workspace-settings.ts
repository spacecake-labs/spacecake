import { Schema } from "effect"

export const AutosaveSchema = Schema.Literal("on", "off")
export type Autosave = typeof AutosaveSchema.Type

/**
 * Schema for workspace settings with defaults for missing fields.
 * Used when reading/decoding from database.
 */
export const WorkspaceSettingsSchema = Schema.Struct({
  autosave: Schema.optionalWith(AutosaveSchema, { default: () => "off" as const }),
})

export type WorkspaceSettings = typeof WorkspaceSettingsSchema.Type

/**
 * Strict schema for storage - all fields required (no decoding optionality).
 * Used for drizzle insert/update operations.
 */
export const WorkspaceSettingsStrictSchema = Schema.Struct({
  autosave: AutosaveSchema,
})

/**
 * Default workspace settings used when no settings exist.
 */
export const defaultWorkspaceSettings: WorkspaceSettings = {
  autosave: "off",
}

/**
 * Row schema for the workspace settings query result.
 */
export const WorkspaceSettingsRowSchema = Schema.Struct({
  settings: Schema.NullOr(Schema.Unknown),
})
export type WorkspaceSettingsRow = typeof WorkspaceSettingsRowSchema.Type
