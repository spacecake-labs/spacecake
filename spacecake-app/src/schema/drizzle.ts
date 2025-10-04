import {
  createInsertSchema,
  createSelectSchema,
  JsonValue,
} from "@/schema/drizzle-effect"
import { sql } from "drizzle-orm"
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { Schema } from "effect"

export const systemTable = pgTable("system", {
  version: integer().notNull().default(0),
})

export const workspaceTable = pgTable(
  "workspace",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    path: text("path").notNull(),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    is_open: boolean("is_open").default(false).notNull(),
  },
  (table) => [uniqueIndex("workspace_path_idx").on(table.path)]
)

export const WorkspaceInsertSchema = createInsertSchema(workspaceTable)
export type WorkspaceInsert = typeof WorkspaceInsertSchema.Type

export const WorkspaceSelectSchema = createSelectSchema(workspaceTable)
export type WorkspaceSelect = typeof WorkspaceSelectSchema.Type

export const fileTable = pgTable(
  "file",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspace_id: uuid("workspace_id")
      .references(() => workspaceTable.id)
      .notNull(),
    path: text("path").notNull(),
    cid: text("cid").notNull(),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    is_open: boolean("is_open").default(false).notNull(),
    lexical_state:
      jsonb("lexical_state").$type<Schema.Schema.Type<typeof JsonValue>>(),
  },
  (table) => [uniqueIndex("file_path_idx").on(table.path)]
)

export const FileInsertSchema = createInsertSchema(fileTable)
export type FileInsert = typeof FileInsertSchema.Type

export const FileSelectSchema = createSelectSchema(fileTable)
export type FileSelect = typeof FileSelectSchema.Type
