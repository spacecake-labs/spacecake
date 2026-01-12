import { Schema } from "effect"

// Tagged classes for workspace errors in URL search params
// Using Schema.TaggedClass for automatic serialization/validation

export class WorkspaceNotFound extends Schema.TaggedClass<WorkspaceNotFound>()(
  "WorkspaceNotFound",
  {
    path: Schema.String,
  }
) {}

export class WorkspaceNotAccessible extends Schema.TaggedClass<WorkspaceNotAccessible>()(
  "WorkspaceNotAccessible",
  {
    path: Schema.String,
  }
) {}

export type WorkspaceError = WorkspaceNotFound | WorkspaceNotAccessible

export const WorkspaceErrorSchema = Schema.Union(
  WorkspaceNotFound,
  WorkspaceNotAccessible
)
