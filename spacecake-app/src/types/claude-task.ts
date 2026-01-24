import { Schema } from "effect"

// ============================================
// Branded Types
// ============================================

export const ClaudeTaskIdSchema = Schema.String.pipe(
  Schema.brand("ClaudeTaskId")
)
export type ClaudeTaskId = typeof ClaudeTaskIdSchema.Type

export const ClaudeTaskListIdSchema = Schema.String.pipe(
  Schema.brand("ClaudeTaskListId")
)
export type ClaudeTaskListId = typeof ClaudeTaskListIdSchema.Type

// ============================================
// Task Schema
// ============================================

export const ClaudeTaskStatusSchema = Schema.Literal(
  "pending",
  "in_progress",
  "completed"
)
export type ClaudeTaskStatus = typeof ClaudeTaskStatusSchema.Type

export const ClaudeTaskSchema = Schema.Struct({
  id: ClaudeTaskIdSchema,
  subject: Schema.String,
  description: Schema.String,
  status: ClaudeTaskStatusSchema,
  activeForm: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  blocks: Schema.optional(Schema.Array(Schema.String)),
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
})
export type ClaudeTask = typeof ClaudeTaskSchema.Type

// ============================================
// Error
// ============================================

export class ClaudeTaskError {
  readonly _tag = "ClaudeTaskError"
  constructor(
    public readonly description: string,
    public readonly path?: string
  ) {}
}

// ============================================
// IPC Events
// ============================================

export type ClaudeTaskEvent =
  | { kind: "initial"; tasks: ClaudeTask[] }
  | { kind: "update"; task: ClaudeTask }
  | { kind: "remove"; taskId: string }
