import {
  createInsertSchema,
  createSelectSchema,
  JsonValue,
} from "@/schema/drizzle-effect"
import { sql } from "drizzle-orm"
import {
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

export const windowTable = pgTable("window", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workspace_id: uuid("workspace_id").references(() => workspaceTable.id),
  created_at: timestamp("created_at", { mode: "string" })
    .defaultNow()
    .notNull(),
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
  },
  (table) => [uniqueIndex("workspace_path_idx").on(table.path)]
)

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
  },
  (table) => [uniqueIndex("file_path_idx").on(table.path)]
)

export const FileInsertSchema = createInsertSchema(fileTable)
export type FileInsert = typeof FileInsertSchema.Type

export const FileSelectSchema = createSelectSchema(fileTable)
export type FileSelect = typeof FileSelectSchema.Type

export const viewGroupTable = pgTable("view_group", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  window_id: uuid("window_id")
    .references(() => windowTable.id)
    .notNull(),
  index: integer("index").notNull(),
  created_at: timestamp("created_at", { mode: "string" })
    .defaultNow()
    .notNull(),
})

export const ViewGroupInsertSchema = createInsertSchema(viewGroupTable)
export type ViewGroupInsert = typeof ViewGroupInsertSchema.Type
export const ViewGroupSelectSchema = createSelectSchema(viewGroupTable)
export type ViewGroupSelect = typeof ViewGroupSelectSchema.Type

export const viewTable = pgTable("view", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  view_group_id: uuid("view_group_id")
    .references(() => viewGroupTable.id)
    .notNull(),
  file_id: uuid("file_id")
    .references(() => fileTable.id)
    .notNull(),
  state: jsonb("state").$type<Schema.Schema.Type<typeof JsonValue>>(),
  created_at: timestamp("created_at", { mode: "string" })
    .defaultNow()
    .notNull(),
})

export const ViewInsertSchema = createInsertSchema(viewTable)
export type ViewInsert = typeof ViewInsertSchema.Type
export const ViewSelectSchema = createSelectSchema(viewTable)
export type ViewSelect = typeof ViewSelectSchema.Type
