import { WindowSelectSchema } from "@/schema/window"
import { WorkspaceSelectSchema } from "@/schema/workspace"
import { Schema } from "effect"

export const WindowWorkspaceSelectSchema = Schema.Struct({
  windowId: WindowSelectSchema.fields.id,
  workspace: Schema.NullOr(
    Schema.Struct({
      id: WorkspaceSelectSchema.fields.id,
      path: WorkspaceSelectSchema.fields.path,
    })
  ),
})
export type WindowWorkspaceSelect = typeof WindowWorkspaceSelectSchema.Type
