import { Schema } from "effect"

import { AbsolutePathSchema, FileTypeSchema } from "@/types/workspace"

// Recent file schema using existing types
export const RecentFileSchema = Schema.Struct({
  path: AbsolutePathSchema,
  name: Schema.String,
  fileType: FileTypeSchema,
  lastAccessed: Schema.Number, // timestamp
  workspacePath: AbsolutePathSchema, // actual workspace path, not encoded ID
})
export type RecentFile = typeof RecentFileSchema.Type

// Recent files array schema
export const RecentFilesSchema = Schema.Array(RecentFileSchema)
export type RecentFiles = typeof RecentFilesSchema.Type

// Map of workspace path to recent files
export const RecentFilesMapSchema = Schema.Record({
  key: Schema.String,
  value: RecentFilesSchema,
})
export type RecentFilesMap = typeof RecentFilesMapSchema.Type

// Workspace state schema using existing WorkspaceInfo structure
export const WorkspaceStateSchema = Schema.Struct({
  lastWorkspace: Schema.Struct({
    path: AbsolutePathSchema,
    name: Schema.String,
  }),
})
export type WorkspaceState = typeof WorkspaceStateSchema.Type
