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
    is_open: boolean("is_open").notNull().default(false),
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
    state: jsonb("state").$type<Schema.Schema.Type<typeof JsonValue>>(),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("file_path_idx").on(table.path)]
)

export const paneTable = pgTable("pane", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workspace_id: uuid("workspace_id")
    .references(() => workspaceTable.id)
    .notNull(),
  position: integer("index").notNull(),
  is_active: boolean("is_active").notNull().default(false),
})

export const PaneInsertSchema = createInsertSchema(paneTable)
export type PaneInsert = typeof PaneInsertSchema.Type
export const PaneSelectSchema = createSelectSchema(paneTable)
export type PaneSelect = typeof PaneSelectSchema.Type

export const elementTable = pgTable("element", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  pane_id: uuid("pane_id")
    .references(() => paneTable.id)
    .notNull(),
  file_id: uuid("file_id")
    .references(() => fileTable.id)
    .notNull(),
  position: integer("index").notNull(),
  is_active: boolean("is_active").notNull().default(false),
})

export const ElementInsertSchema = createInsertSchema(elementTable)
export type ElementInsert = typeof ElementInsertSchema.Type
export const ElementSelectSchema = createSelectSchema(elementTable)
export type ElementSelect = typeof ElementSelectSchema.Type
