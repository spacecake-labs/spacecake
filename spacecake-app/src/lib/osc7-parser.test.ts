import { describe, it, expect } from "vitest"

import { parseOsc7, hasOsc7Data, OSC7_RE } from "@/lib/osc7-parser"

describe("OSC 7 Parser", () => {
  describe("hasOsc7Data", () => {
    it("should detect valid OSC 7 sequences with bell terminator", () => {
      const data = "\x1b]7;file:///home/user/projects\x07"
      expect(hasOsc7Data(data)).toBe(true)
    })

    it("should detect valid OSC 7 sequences with string terminator", () => {
      const data = "\x1b]7;file:///home/user/projects\x1b\\"
      expect(hasOsc7Data(data)).toBe(true)
    })

    it("should return false for non-OSC 7 data", () => {
      const data = "some regular terminal output"
      expect(hasOsc7Data(data)).toBe(false)
    })

    it("should return false for incomplete OSC 7", () => {
      const data = "\x1b]7;file:///home/user"
      expect(hasOsc7Data(data)).toBe(false)
    })
  })

  describe("parseOsc7", () => {
    it("should parse simple absolute paths", () => {
      const data = "\x1b]7;file:///home/user/projects\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/projects")
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now())
    })

    it("should parse paths with hostname", () => {
      const data = "\x1b]7;file://localhost/home/user/projects\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/projects")
    })

    it("should parse paths with remote hostname", () => {
      const data = "\x1b]7;file://remote.host/home/user/projects\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/projects")
    })

    it("should handle URL-encoded spaces (%20)", () => {
      const data = "\x1b]7;file:///home/user/My%20Projects\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/My Projects")
    })

    it("should handle other URL-encoded characters", () => {
      const data = "\x1b]7;file:///home/user/project%2Bv1.0\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/project+v1.0")
    })

    it("should use string terminator (\\x1b\\\\) as well as bell terminator", () => {
      const data1 = "\x1b]7;file:///home/user/path1\x07"
      const data2 = "\x1b]7;file:///home/user/path2\x1b\\"

      expect(parseOsc7(data1)?.path).toBe("/home/user/path1")
      expect(parseOsc7(data2)?.path).toBe("/home/user/path2")
    })

    it("should handle paths with special characters that are URL-safe", () => {
      const data = "\x1b]7;file:///home/user/project-name_v1\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/project-name_v1")
    })

    it("should return null for sequences with no path", () => {
      const data = "\x1b]7;file://\x07"
      const result = parseOsc7(data)

      expect(result).toBeNull()
    })

    it("should return null for malformed sequences", () => {
      const data = "\x1b]7;invalid://path\x07"
      const result = parseOsc7(data)

      expect(result).toBeNull()
    })

    it("should return null for data without OSC 7 sequence", () => {
      const data = "some regular terminal output"
      const result = parseOsc7(data)

      expect(result).toBeNull()
    })

    it("should extract path from data containing other content", () => {
      const data = "prompt$ \x1b]7;file:///home/user/current\x07more output"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/home/user/current")
    })

    it("should handle macOS-style paths", () => {
      const data = "\x1b]7;file:///Users/alexandermoores/Documents/GitHub\x07"
      const result = parseOsc7(data)

      expect(result).not.toBeNull()
      expect(result?.path).toBe("/Users/alexandermoores/Documents/GitHub")
    })

    it("should timestamp results", () => {
      const before = Date.now()
      const data = "\x1b]7;file:///home/user\x07"
      const result = parseOsc7(data)
      const after = Date.now()

      expect(result?.timestamp).toBeGreaterThanOrEqual(before)
      expect(result?.timestamp).toBeLessThanOrEqual(after)
    })

    it("should handle invalid URL encoding gracefully", () => {
      // %XX with invalid hex should be left as-is by decodeURIComponent
      const data = "\x1b]7;file:///home/user/path%\x07"
      // This should not throw; decodeURIComponent is lenient
      expect(() => parseOsc7(data)).not.toThrow()
    })
  })

  describe("OSC7_RE regex", () => {
    it("should match the regex pattern correctly", () => {
      const matches = "\x1b]7;file:///path\x07".match(OSC7_RE)
      expect(matches).not.toBeNull()
      expect(matches?.[1]).toBe("/path")
    })

    it("should capture everything after hostname/", () => {
      const matches = "\x1b]7;file://host/some/path\x07".match(OSC7_RE)
      expect(matches?.[1]).toBe("/some/path")
    })
  })
})
