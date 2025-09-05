import { Schema } from "effect"

/**
 * types for the editor layout and state.
 * this structure is designed to be extensible for features like split panes and multiple tabs,
 * following best practices from modern editors like vscode or zed.
 */

// a unique identifier for a tab.
export const TabIdSchema = Schema.String
export type TabId = typeof TabIdSchema.Type

// a unique identifier for a tab group.
export const TabGroupIdSchema = Schema.String
export type TabGroupId = typeof TabGroupIdSchema.Type

// represents a single tab in the editor, which corresponds to an open file.
export const EditorTabSchema = Schema.Struct({
  id: TabIdSchema,
  // the absolute path to the file opened in the tab.
  filePath: Schema.String,
})
export type EditorTab = typeof EditorTabSchema.Type

// represents a group of tabs. the editor can be split into multiple tab groups (e.g., side-by-side).
export const EditorTabGroupSchema = Schema.Struct({
  id: TabGroupIdSchema,
  // the list of tabs in this group.
  tabs: Schema.Array(EditorTabSchema),
  // the id of the currently active tab in this group.
  activeTabId: Schema.Union(TabIdSchema, Schema.Null),
})
export type EditorTabGroup = typeof EditorTabGroupSchema.Type

// represents the entire layout of the editor, including all tab groups and their tabs.
// for now, we will likely only have a single tab group with a single tab.
export const EditorLayoutSchema = Schema.Struct({
  // the list of tab groups in the editor.
  tabGroups: Schema.Array(EditorTabGroupSchema),
  // the id of the currently active tab group.
  activeTabGroupId: Schema.Union(TabGroupIdSchema, Schema.Null),
})
export type EditorLayout = typeof EditorLayoutSchema.Type
