import { fileTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { Brand, Schema } from "effect"


export type FilePrimaryKey = string & Brand.Brand<"FilePrimaryKey">
export const FilePrimaryKey = Brand.nominal<FilePrimaryKey>()
export const FilePrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(FilePrimaryKey)
)

export const FileInsertSchema = createInsertSchema(fileTable)
export type FileInsert = typeof FileInsertSchema.Type

export const FileSelectSchema = Schema.Struct({
  id: FilePrimaryKeySchema,
  ...createSelectSchema(fileTable).omit("id").fields,
})
export type FileSelect = typeof FileSelectSchema.Type

export const FileUpdateStateSchema = FileInsertSchema.pick("path", "state")
export type FileUpdateState = typeof FileUpdateStateSchema.Type
