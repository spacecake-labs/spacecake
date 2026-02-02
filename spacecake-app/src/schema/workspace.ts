import { Brand, Schema } from "effect"

import { workspaceTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { WorkspaceLayoutStrictSchema } from "@/schema/workspace-layout"
import { WorkspaceSettingsStrictSchema } from "@/schema/workspace-settings"

export type WorkspacePrimaryKey = string & Brand.Brand<"WorkspacePrimaryKey">
export const WorkspacePrimaryKey = Brand.nominal<WorkspacePrimaryKey>()
export const WorkspacePrimaryKeySchema = Schema.String.pipe(Schema.fromBrand(WorkspacePrimaryKey))

export const WorkspaceInsertSchema = createInsertSchema(workspaceTable, {
  layout: WorkspaceLayoutStrictSchema,
  settings: WorkspaceSettingsStrictSchema,
})
export type WorkspaceInsert = typeof WorkspaceInsertSchema.Type

export const WorkspaceSelectSchema = Schema.Struct({
  id: WorkspacePrimaryKeySchema,
  ...createSelectSchema(workspaceTable).omit("id").fields,
})
export type WorkspaceSelect = typeof WorkspaceSelectSchema.Type
