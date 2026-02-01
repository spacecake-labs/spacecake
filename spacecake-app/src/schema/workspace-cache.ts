import { Schema } from "effect"

import { EditorPrimaryKeySchema } from "@/schema/editor"
import { FilePrimaryKeySchema } from "@/schema/file"
import { ViewKindSchema } from "@/types/lexical"
import { AbsolutePathSchema } from "@/types/workspace"

/**
 * Workspace cache row represents the cached file information for a workspace.
 * This is used to quickly determine file status and editor state on startup.
 */
export const WorkspaceCacheRowSchema = Schema.Struct({
  filePath: AbsolutePathSchema,
  fileId: FilePrimaryKeySchema,
  view_kind: ViewKindSchema,
  has_cached_state: Schema.Boolean,
  mtime: Schema.DateFromSelf,
  cid: Schema.String,
  editorId: Schema.NullOr(EditorPrimaryKeySchema),
})

export type WorkspaceCacheRow = typeof WorkspaceCacheRowSchema.Type
