import * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

import { terminalTable } from "@/schema/drizzle"
import { createInsertSchema, createSelectSchema } from "@/schema/drizzle-effect"
import { WorkspacePrimaryKeySchema } from "@/schema/workspace"

export type TerminalPrimaryKey = string & Brand.Brand<"TerminalPrimaryKey">
export const TerminalPrimaryKey = Brand.nominal<TerminalPrimaryKey>()
export const TerminalPrimaryKeySchema = Schema.String.pipe(Schema.fromBrand(TerminalPrimaryKey))

export const TerminalInsertSchema = createInsertSchema(terminalTable, {
  id: TerminalPrimaryKeySchema,
  workspace_id: WorkspacePrimaryKeySchema,
})
export type TerminalInsert = Schema.Schema.Encoded<typeof TerminalInsertSchema>

export const TerminalSelectSchema = Schema.Struct({
  id: TerminalPrimaryKeySchema,
  ...createSelectSchema(terminalTable, {
    workspace_id: WorkspacePrimaryKeySchema,
  }).omit("id").fields,
})
export type TerminalSelect = typeof TerminalSelectSchema.Type
