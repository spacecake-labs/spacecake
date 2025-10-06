import { windowTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { Brand, Schema } from "effect"

export type WindowPrimaryKey = string & Brand.Brand<"WindowPrimaryKey">
export const WindowPrimaryKey = Brand.nominal<WindowPrimaryKey>()
export const WindowPrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(WindowPrimaryKey)
)

export const WindowInsertSchema = createInsertSchema(windowTable)
export type WindowInsert = typeof WindowInsertSchema.Type

export const WindowSelectSchema = Schema.Struct({
  id: WindowPrimaryKeySchema,
  ...createSelectSchema(windowTable).omit("id").fields,
})
export type WindowSelect = typeof WindowSelectSchema.Type
