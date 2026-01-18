import { StatuslineInput } from "@/types/statusline"

export interface DisplayStatusline {
  model: string
  contextUsagePercent: number | null
  contextRemainingPercent: number | null
  costUsd: number
  cwd: string
  sessionId: string
  timestamp: number
}

export interface StatuslineData {
  model: string
  contextUsagePercent: number
  cost: number
  timestamp: number
}

/**
 * Parse statusline data from OSC escape sequence in terminal output
 * Expected format: \x1b]1337;StatuslineData;{...}\x07
 */
export function parseStatuslineOutput(data: string): StatuslineData | null {
  if (!data) return null

  try {
    // Look for OSC sequence: \x1b]1337;StatuslineData;{...}\x07
    // eslint-disable-next-line no-control-regex
    const oscPattern = /\x1b\]1337;StatuslineData;(.+?)\x07/
    const match = data.match(oscPattern)

    if (!match || !match[1]) {
      return null
    }

    const json = JSON.parse(match[1]) as StatuslineInput

    return {
      model: json.model.display_name,
      contextUsagePercent: json.context_window.used_percentage ?? 0,
      cost: json.cost.total_cost_usd,
      timestamp: Date.now(),
    }
  } catch {
    // Silently return null on parse errors
    return null
  }
}

/**
 * Check if data contains a statusline OSC sequence
 */
export function hasStatuslineData(data: string): boolean {
  if (!data) return false
  // eslint-disable-next-line no-control-regex
  return /\x1b\]1337;StatuslineData;(.+?)\x07/.test(data)
}

/**
 * Parse statusline input from Claude Code HTTP POST
 * Extracts display-relevant fields from full Claude Code schema
 */
export function parseStatuslineInput(
  input: StatuslineInput
): DisplayStatusline {
  return {
    model: input.model.display_name,
    contextUsagePercent: input.context_window.used_percentage,
    contextRemainingPercent: input.context_window.remaining_percentage,
    costUsd: input.cost.total_cost_usd,
    cwd: input.cwd,
    sessionId: input.session_id,
    timestamp: Date.now(),
  }
}
