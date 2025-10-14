import {
  createInsertSchema,
  createSelectSchema,
  type JsonValue,
} from "@/schema/drizzle-effect"
import { sql } from "drizzle-orm"
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { ViewKindSchema } from "@/types/lexical"

export const systemTable = pgTable("system", {
  version: integer().notNull().default(0),
})

export const workspaceTable = pgTable(
  "workspace",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // path: text("path").$type<AbsolutePath>().notNull(),
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
    path: text("path").notNull(),
    cid: text("cid").notNull(),
    mtime: timestamp("mtime", { mode: "string" }).notNull(),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("file_path_idx").on(table.path)]
)

export const paneTable = pgTable(
  "pane",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspace_id: uuid("workspace_id")
      .references(() => workspaceTable.id)
      .notNull(),
    position: integer("index").notNull(),
    is_active: boolean("is_active").notNull().default(false),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("pane_workspace_position_idx").on(
      table.workspace_id,
      table.position
    ),
  ]
)

export const PaneInsertSchema = createInsertSchema(paneTable)
export type PaneInsert = typeof PaneInsertSchema.Type
export const PaneSelectSchema = createSelectSchema(paneTable)
export type PaneSelect = typeof PaneSelectSchema.Type

// must be exported for drizzle to recognise it
export const ViewKindEnum = pgEnum("view_kind", ViewKindSchema.literals)

export const editorTable = pgTable(
  "editor",
  {
    id: uuid("id")
      // .$type<EditorPrimaryKey>()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pane_id: uuid("pane_id")
      .references(() => paneTable.id)
      .notNull(),
    file_id: uuid("file_id")
      .references(() => fileTable.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("index").notNull(),
    view_kind: ViewKindEnum("view_kind").notNull(),
    is_active: boolean("is_active").notNull().default(false),
    state: jsonb("state").$type<JsonValue>(),
    state_updated_at: timestamp("state_updated_at", { mode: "string" }),
    created_at: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("editor_pane_file_idx").on(table.pane_id, table.file_id),
  ]
)
