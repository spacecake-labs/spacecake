import { Data } from "effect"

export class StatuslineError extends Data.TaggedError("StatuslineError")<{
  readonly message: string
}> {}

export interface StatuslineInput {
  readonly hook_event_name: string
  readonly session_id: string
  readonly transcript_path: string
  readonly cwd: string
  readonly model: {
    readonly id: string
    readonly display_name: string
  }
  readonly workspace: {
    readonly current_dir: string
    readonly project_dir: string
  }
  readonly version: string
  readonly output_style: {
    readonly name: string
  }
  readonly cost: {
    readonly total_cost_usd: number
    readonly total_duration_ms: number
    readonly total_api_duration_ms: number
    readonly total_lines_added: number
    readonly total_lines_removed: number
  }
  readonly context_window: {
    readonly total_input_tokens: number
    readonly total_output_tokens: number
    readonly context_window_size: number
    readonly used_percentage: number
    readonly remaining_percentage: number
    readonly current_usage: {
      readonly input_tokens: number
      readonly output_tokens: number
      readonly cache_creation_input_tokens: number
      readonly cache_read_input_tokens: number
    } | null
  }
}

export interface StatuslineConfig {
  readonly padding?: number
}
