import { editorTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { FileSelectSchema } from "@/schema/file"
import { WorkspaceSelectSchema } from "@/schema/workspace"
import { Brand, Schema } from "effect"

export type EditorPrimaryKey = string & Brand.Brand<"EditorPrimaryKey">
export const EditorPrimaryKey = Brand.nominal<EditorPrimaryKey>()
export const EditorPrimaryKeySchema = Schema.String.pipe(
  Schema.fromBrand(EditorPrimaryKey)
)

export const EditorInsertSchema = createInsertSchema(editorTable, {
  id: EditorPrimaryKeySchema,
})
export type EditorInsert = Schema.Schema.Encoded<typeof EditorInsertSchema>

export const EditorSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  ...createSelectSchema(editorTable).omit("id").fields,
})
export type EditorSelect = Schema.Schema.Type<typeof EditorSelectSchema>

export const ActiveEditorSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  viewKind: EditorSelectSchema.fields.view_kind,
  workspacePath: WorkspaceSelectSchema.fields.path,
  filePath: FileSelectSchema.fields.path,
})

export const EditorUpdateStateSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  state: EditorSelectSchema.fields.state,
})
export type EditorStateUpdate = Schema.Schema.Encoded<
  typeof EditorUpdateStateSchema
>

export const EditorStateSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  state: EditorSelectSchema.fields.state,
  view_kind: EditorSelectSchema.fields.view_kind,
})
export type EditorStateSelect = Schema.Schema.Type<
  typeof EditorStateSelectSchema
>
