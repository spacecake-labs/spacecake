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
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import type { WorkspaceLayout } from "@/schema/workspace-layout"

import { type JsonValue } from "@/schema/drizzle-effect"
import { SerializedSelection, ViewKindSchema } from "@/types/lexical"

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
    layout: jsonb("layout").$type<WorkspaceLayout>(),
    active_pane_id: uuid("active_pane_id").references((): AnyPgColumn => paneTable.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("workspace_path_idx").on(table.path)],
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
    created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    // nullable to allow for preloading
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" }),
  },
  (table) => [uniqueIndex("file_path_idx").on(table.path)],
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
    active_pane_item_id: uuid("active_pane_item_id").references(
      (): AnyPgColumn => paneItemTable.id,
      { onDelete: "set null" },
    ),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pane_workspace_position_idx").on(table.workspace_id, table.position)],
)

// must be exported for drizzle to recognise it
export const PaneItemKindEnum = pgEnum("pane_item_kind", ["editor"])

export const paneItemTable = pgTable(
  "pane_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pane_id: uuid("pane_id")
      .references(() => paneTable.id, { onDelete: "cascade" })
      .notNull(),
    kind: PaneItemKindEnum("kind").notNull(),
    editor_id: uuid("editor_id").references((): AnyPgColumn => editorTable.id, {
      onDelete: "cascade",
    }),
    position: integer("index").notNull(),
    last_accessed_at: timestamp("last_accessed_at", { mode: "string" }).defaultNow().notNull(),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pane_item_pane_position_idx").on(table.pane_id, table.position),
    uniqueIndex("pane_item_pane_editor_idx").on(table.pane_id, table.editor_id),
  ],
)

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
    view_kind: ViewKindEnum("view_kind").notNull(),
    state: jsonb("state").$type<JsonValue>(),
    state_updated_at: timestamp("state_updated_at", { mode: "string" }),
    selection: jsonb("selection").$type<SerializedSelection>(),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("editor_pane_file_idx").on(table.pane_id, table.file_id)],
)
