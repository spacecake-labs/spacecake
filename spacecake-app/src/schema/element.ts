import { elementTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { FileSelectSchema } from "@/schema/file"
import { WorkspaceSelectSchema } from "@/schema/workspace"
import { Brand, Schema } from "effect"

export type ElementPrimaryKey = string & Brand.Brand<"ElementPrimaryKey">
export const ElementPrimaryKey = Brand.nominal<ElementPrimaryKey>()
export const ElementPrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(ElementPrimaryKey)
)

export const ElementInsertSchema = createInsertSchema(elementTable)
export type ElementInsert = typeof ElementInsertSchema.Type

export const ElementSelectSchema = Schema.Struct({
  id: ElementPrimaryKeySchema,
  ...createSelectSchema(elementTable).omit("id").fields,
})
export type ElementSelect = typeof ElementSelectSchema.Type

export const ActiveElementSelectSchema = Schema.Struct({
  id: ElementPrimaryKeySchema,
  viewKind: ElementSelectSchema.fields.view_kind,

  workspacePath: WorkspaceSelectSchema.fields.path,
  filePath: FileSelectSchema.fields.path,
})
