import { Brand, Schema } from "effect"

import { editorTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { FileSelectSchema } from "@/schema/file"
import { WorkspaceSelectSchema } from "@/schema/workspace"
import { SerializedSelectionSchema } from "@/types/lexical"

export type EditorPrimaryKey = string & Brand.Brand<"EditorPrimaryKey">
export const EditorPrimaryKey = Brand.nominal<EditorPrimaryKey>()
export const EditorPrimaryKeySchema = Schema.String.pipe(Schema.fromBrand(EditorPrimaryKey))

export const EditorInsertSchema = createInsertSchema(editorTable, {
  id: EditorPrimaryKeySchema,
  selection: Schema.OptionFromNullOr(SerializedSelectionSchema),
})
export type EditorInsert = Schema.Schema.Encoded<typeof EditorInsertSchema>

export const EditorUpdateSchema = EditorInsertSchema.omit("id").pipe(
  Schema.partial,
  Schema.extend(Schema.Struct({ id: EditorPrimaryKeySchema })),
)
export type EditorUpdate = Schema.Schema.Encoded<typeof EditorUpdateSchema>

export const EditorSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  ...createSelectSchema(editorTable, {
    selection: Schema.OptionFromNullOr(SerializedSelectionSchema),
  }).omit("id").fields,
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
  selection: EditorSelectSchema.fields.selection,
  view_kind: EditorSelectSchema.fields.view_kind,
})
export type EditorStateUpdate = Schema.Schema.Encoded<typeof EditorUpdateStateSchema>

export const EditorStateSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  state: EditorSelectSchema.fields.state,
  view_kind: EditorSelectSchema.fields.view_kind,
  selection: EditorSelectSchema.fields.selection,
})
export type EditorStateSelect = Schema.Schema.Type<typeof EditorStateSelectSchema>

export const EditorStateWithFileIdSelectSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  state: EditorSelectSchema.fields.state,
  view_kind: EditorSelectSchema.fields.view_kind,
  selection: EditorSelectSchema.fields.selection,
  fileId: FileSelectSchema.fields.id,
})

export const EditorUpdateSelectionSchema = Schema.Struct({
  id: EditorPrimaryKeySchema,
  selection: Schema.OptionFromNullOr(SerializedSelectionSchema),
})
export type EditorSelectionUpdate = Schema.Schema.Encoded<typeof EditorUpdateSelectionSchema>
