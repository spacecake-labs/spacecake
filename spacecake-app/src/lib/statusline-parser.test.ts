import { describe, expect, it } from "vitest"

import {
  hasStatuslineData,
  parseStatuslineInput,
  parseStatuslineOutput,
} from "@/lib/statusline-parser"
import { StatuslineInput } from "@/types/statusline"

// Helper to create valid StatuslineInput
const createStatuslineInput = (overrides?: Partial<StatuslineInput>): StatuslineInput => ({
  hook_event_name: "Status",
  session_id: "test-session-id",
  transcript_path: "/path/to/transcript",
  cwd: "/home/user",
  model: { id: "claude-3-5-sonnet", display_name: "Claude 3.5 Sonnet" },
  workspace: { current_dir: "/current", project_dir: "/project" },
  version: "1.0",
  output_style: { name: "default" },
  cost: {
    total_cost_usd: 0.1234,
    total_duration_ms: 1000,
    total_api_duration_ms: 900,
    total_lines_added: 10,
    total_lines_removed: 2,
  },
  context_window: {
    total_input_tokens: 1000,
    total_output_tokens: 500,
    context_window_size: 10000,
    used_percentage: 65.5,
    remaining_percentage: 34.5,
    current_usage: {
      input_tokens: 500,
      output_tokens: 250,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  },
  ...overrides,
})

describe("statusline-parser", () => {
  describe("parseStatuslineOutput", () => {
    it("should parse valid OSC statusline data", () => {
      const input = createStatuslineInput()
      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07some text`

      const result = parseStatuslineOutput(data)

      expect(result).not.toBeNull()
      expect(result?.model).toBe("Claude 3.5 Sonnet")
      expect(result?.contextUsagePercent).toBe(65.5)
      expect(result?.cost).toBe(0.1234)
      expect(result?.timestamp).toBeDefined()
    })

    it("should return null for data without OSC sequence", () => {
      const data = "regular terminal output"
      const result = parseStatuslineOutput(data)
      expect(result).toBeNull()
    })

    it("should return null for empty string", () => {
      const result = parseStatuslineOutput("")
      expect(result).toBeNull()
    })

    it("should return null for malformed JSON in OSC sequence", () => {
      const data = `\x1b]1337;StatuslineData;{invalid json}\x07some text`
      const result = parseStatuslineOutput(data)
      expect(result).toBeNull()
    })

    it("should handle 0% context usage", () => {
      const input = createStatuslineInput({
        model: { id: "claude-3-haiku", display_name: "Haiku" },
        context_window: {
          total_input_tokens: 100,
          total_output_tokens: 50,
          context_window_size: 10000,
          used_percentage: 0,
          remaining_percentage: 100,
          current_usage: null,
        },
      })

      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07`

      const result = parseStatuslineOutput(data)

      expect(result).not.toBeNull()
      expect(result?.contextUsagePercent).toBe(0)
    })

    it("should handle 100% context usage", () => {
      const input = createStatuslineInput({
        model: { id: "claude-3-opus", display_name: "Opus" },
        context_window: {
          total_input_tokens: 10000,
          total_output_tokens: 5000,
          context_window_size: 10000,
          used_percentage: 100,
          remaining_percentage: 0,
          current_usage: null,
        },
        cost: {
          total_cost_usd: 1.5678,
          total_duration_ms: 5000,
          total_api_duration_ms: 4500,
          total_lines_added: 50,
          total_lines_removed: 10,
        },
      })

      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07`

      const result = parseStatuslineOutput(data)

      expect(result).not.toBeNull()
      expect(result?.contextUsagePercent).toBe(100)
      expect(result?.cost).toBe(1.5678)
    })

    it("should set current timestamp", () => {
      const input = createStatuslineInput()
      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07`

      const beforeParse = Date.now()
      const result = parseStatuslineOutput(data)
      const afterParse = Date.now()

      expect(result).not.toBeNull()
      expect(result!.timestamp).toBeGreaterThanOrEqual(beforeParse)
      expect(result!.timestamp).toBeLessThanOrEqual(afterParse)
    })

    it("should handle various model names", () => {
      const models = ["Claude 3.5 Sonnet", "Claude 3 Opus", "Claude 3 Haiku", "Custom Model Name"]

      models.forEach((modelName) => {
        const input = createStatuslineInput({
          model: { id: modelName.toLowerCase(), display_name: modelName },
        })

        const jsonPayload = JSON.stringify(input)
        const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07`

        const result = parseStatuslineOutput(data)

        expect(result?.model).toBe(modelName)
      })
    })

    it("should handle OSC sequence followed by other text", () => {
      const input = createStatuslineInput()
      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}\x07[prompt] user@host:~$`

      const result = parseStatuslineOutput(data)

      expect(result).not.toBeNull()
      expect(result?.model).toBe("Claude 3.5 Sonnet")
    })

    it("should ignore missing end terminator", () => {
      const input = createStatuslineInput()
      const jsonPayload = JSON.stringify(input)
      const data = `\x1b]1337;StatuslineData;${jsonPayload}`

      const result = parseStatuslineOutput(data)

      // Should return null because the sequence is not properly terminated
      expect(result).toBeNull()
    })

    it("should parse multiple OSC sequences but use first one", () => {
      const input1 = createStatuslineInput({
        model: { id: "first", display_name: "First" },
        context_window: {
          total_input_tokens: 100,
          total_output_tokens: 50,
          context_window_size: 10000,
          used_percentage: 30,
          remaining_percentage: 70,
          current_usage: null,
        },
      })

      const input2 = createStatuslineInput({
        model: { id: "second", display_name: "Second" },
        context_window: {
          total_input_tokens: 500,
          total_output_tokens: 250,
          context_window_size: 10000,
          used_percentage: 70,
          remaining_percentage: 30,
          current_usage: null,
        },
        cost: {
          total_cost_usd: 0.05,
          total_duration_ms: 2000,
          total_api_duration_ms: 1800,
          total_lines_added: 20,
          total_lines_removed: 5,
        },
      })

      const data =
        `\x1b]1337;StatuslineData;${JSON.stringify(input1)}\x07` +
        `\x1b]1337;StatuslineData;${JSON.stringify(input2)}\x07`

      const result = parseStatuslineOutput(data)

      expect(result?.model).toBe("First")
      expect(result?.contextUsagePercent).toBe(30)
    })
  })

  describe("hasStatuslineData", () => {
    it("should return true for data with OSC sequence", () => {
      const input = createStatuslineInput()
      const data = `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07`

      expect(hasStatuslineData(data)).toBe(true)
    })

    it("should return false for regular text", () => {
      expect(hasStatuslineData("regular terminal output")).toBe(false)
    })

    it("should return false for empty string", () => {
      expect(hasStatuslineData("")).toBe(false)
    })

    it("should return false for partial OSC sequence", () => {
      expect(hasStatuslineData("\x1b]1337;StatuslineData;")).toBe(false)
    })

    it("should work with mixed output", () => {
      const input = createStatuslineInput()

      const data =
        `some terminal output\n` +
        `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07` +
        `[prompt] user@host:~$`

      expect(hasStatuslineData(data)).toBe(true)
    })
  })

  describe("parseStatuslineInput", () => {
    it("should parse full Claude Code statusline JSON", () => {
      const input = createStatuslineInput()

      const result = parseStatuslineInput(input)

      expect(result.model).toBe("Claude 3.5 Sonnet")
      expect(result.contextUsagePercent).toBe(65.5)
      expect(result.contextRemainingPercent).toBe(34.5)
      expect(result.costUsd).toBe(0.1234)
      expect(result.cwd).toBe("/home/user")
      expect(result.sessionId).toBe("test-session-id")
      expect(result.timestamp).toBeDefined()
    })

    it("should handle 0% context usage with parseStatuslineInput", () => {
      const input = createStatuslineInput({
        context_window: {
          total_input_tokens: 100,
          total_output_tokens: 50,
          context_window_size: 10000,
          used_percentage: 0,
          remaining_percentage: 100,
          current_usage: null,
        },
      })

      const result = parseStatuslineInput(input)

      expect(result.contextUsagePercent).toBe(0)
      expect(result.contextRemainingPercent).toBe(100)
    })

    it("should handle 100% context usage with parseStatuslineInput", () => {
      const input = createStatuslineInput({
        context_window: {
          total_input_tokens: 10000,
          total_output_tokens: 5000,
          context_window_size: 10000,
          used_percentage: 100,
          remaining_percentage: 0,
          current_usage: null,
        },
      })

      const result = parseStatuslineInput(input)

      expect(result.contextUsagePercent).toBe(100)
      expect(result.contextRemainingPercent).toBe(0)
    })

    it("should extract session ID", () => {
      const input = createStatuslineInput({
        session_id: "my-custom-session-id-12345",
      })

      const result = parseStatuslineInput(input)

      expect(result.sessionId).toBe("my-custom-session-id-12345")
    })

    it("should extract working directory", () => {
      const input = createStatuslineInput({
        cwd: "/home/user/projects/spacecake",
      })

      const result = parseStatuslineInput(input)

      expect(result.cwd).toBe("/home/user/projects/spacecake")
    })

    it("should handle various model names", () => {
      const models = ["Claude 3.5 Sonnet", "Claude 3 Opus", "Claude 3 Haiku", "Custom Model"]

      models.forEach((modelName) => {
        const input = createStatuslineInput({
          model: { id: modelName.toLowerCase(), display_name: modelName },
        })

        const result = parseStatuslineInput(input)

        expect(result.model).toBe(modelName)
      })
    })

    it("should set current timestamp", () => {
      const input = createStatuslineInput()

      const beforeParse = Date.now()
      const result = parseStatuslineInput(input)
      const afterParse = Date.now()

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeParse)
      expect(result.timestamp).toBeLessThanOrEqual(afterParse)
    })
  })

  describe("edge cases", () => {
    it("should handle very small cost values", () => {
      const input = createStatuslineInput({
        cost: {
          total_cost_usd: 0.00001,
          total_duration_ms: 100,
          total_api_duration_ms: 90,
          total_lines_added: 1,
          total_lines_removed: 0,
        },
      })

      const data = `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07`

      const result = parseStatuslineOutput(data)

      expect(result?.cost).toBe(0.00001)
    })

    it("should handle large cost values", () => {
      const input = createStatuslineInput({
        cost: {
          total_cost_usd: 999.9999,
          total_duration_ms: 10000,
          total_api_duration_ms: 9000,
          total_lines_added: 1000,
          total_lines_removed: 500,
        },
      })

      const data = `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07`

      const result = parseStatuslineOutput(data)

      expect(result?.cost).toBe(999.9999)
    })

    it("should handle decimal precision in context usage", () => {
      const input = createStatuslineInput({
        context_window: {
          total_input_tokens: 1000,
          total_output_tokens: 500,
          context_window_size: 10000,
          used_percentage: 42.123456789,
          remaining_percentage: 57.876543211,
          current_usage: null,
        },
      })

      const data = `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07`

      const result = parseStatuslineOutput(data)

      expect(result?.contextUsagePercent).toBe(42.123456789)
    })

    it("should handle special characters in model names", () => {
      const input = createStatuslineInput({
        model: {
          id: "claude-3-5-sonnet",
          display_name: "Claude 3.5 Sonnet @ v1.2",
        },
      })

      const data = `\x1b]1337;StatuslineData;${JSON.stringify(input)}\x07`

      const result = parseStatuslineOutput(data)

      expect(result?.model).toBe("Claude 3.5 Sonnet @ v1.2")
    })
  })
})
