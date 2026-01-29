import { paneItemTable, paneTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { EditorPrimaryKeySchema } from "@/schema/editor"
import { Brand, Schema } from "effect"

import { ViewKindSchema } from "@/types/lexical"
import { AbsolutePathSchema } from "@/types/workspace"

// Pane Primary Key
export type PanePrimaryKey = string & Brand.Brand<"PanePrimaryKey">
export const PanePrimaryKey = Brand.nominal<PanePrimaryKey>()
export const PanePrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(PanePrimaryKey)
)

// Pane Item Primary Key
export type PaneItemPrimaryKey = string & Brand.Brand<"PaneItemPrimaryKey">
export const PaneItemPrimaryKey = Brand.nominal<PaneItemPrimaryKey>()
export const PaneItemPrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(PaneItemPrimaryKey)
)

// Pane schemas
export const PaneInsertSchema = createInsertSchema(paneTable, {
  id: PanePrimaryKeySchema,
})
export type PaneInsert = Schema.Schema.Encoded<typeof PaneInsertSchema>

export const PaneSelectSchema = Schema.Struct({
  id: PanePrimaryKeySchema,
  ...createSelectSchema(paneTable, {
    active_pane_item_id: Schema.NullOr(PaneItemPrimaryKeySchema),
  }).omit("id").fields,
})
export type PaneSelect = typeof PaneSelectSchema.Type

// Pane Item schemas
export const PaneItemInsertSchema = createInsertSchema(paneItemTable, {
  id: PaneItemPrimaryKeySchema,
  pane_id: PanePrimaryKeySchema,
  editor_id: Schema.NullOr(EditorPrimaryKeySchema),
})
export type PaneItemInsert = Schema.Schema.Encoded<typeof PaneItemInsertSchema>

export const PaneItemSelectSchema = Schema.Struct({
  id: PaneItemPrimaryKeySchema,
  ...createSelectSchema(paneItemTable, {
    pane_id: PanePrimaryKeySchema,
    editor_id: Schema.NullOr(EditorPrimaryKeySchema),
  }).omit("id").fields,
})
export type PaneItemSelect = typeof PaneItemSelectSchema.Type

// Schema for pane items query result (used by usePaneItems hook)
export const PaneItemWithFileSchema = Schema.Struct({
  id: PaneItemPrimaryKeySchema,
  position: Schema.Number,
  editorId: Schema.NullOr(EditorPrimaryKeySchema),
  filePath: AbsolutePathSchema,
  viewKind: ViewKindSchema,
})
export type PaneItemWithFile = typeof PaneItemWithFileSchema.Type
