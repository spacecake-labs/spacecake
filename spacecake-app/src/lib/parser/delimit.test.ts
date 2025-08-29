import { describe, expect, it } from "vitest"

import {
  delimitString,
  delimitStringWithRegex,
  delimitWithSpaceConsumer,
} from "@/lib/parser/delimit"
import { EMPTY_PATTERN } from "@/lib/parser/regex"

describe("delimitString", () => {
  describe("Python docstrings", () => {
    it("should parse simple triple-quoted docstring", () => {
      const result = delimitString('"""Module description"""', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: '"""',
        between: "Module description",
        suffix: '"""',
      })
    })

    it("should parse raw triple-quoted docstring", () => {
      const result = delimitString('r"""Module description"""', {
        prefix: 'r"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: 'r"""',
        between: "Module description",
        suffix: '"""',
      })
    })

    it("should preserve trailing whitespace and newlines", () => {
      const result = delimitString('"""Module description"""\n\n', {
        prefix: '"""',
        suffix: '"""\n\n', // Match the exact suffix including newlines
      })

      expect(result).toEqual({
        prefix: '"""',
        between: "Module description",
        suffix: '"""\n\n',
      })
    })

    it("should preserve leading and trailing spaces in content", () => {
      const result = delimitString('"""  Module description  """', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: '"""',
        between: "  Module description  ",
        suffix: '"""',
      })
    })

    it("should handle complex docstring with mixed whitespace", () => {
      const result = delimitString('r"""  Module description\n\n"""', {
        prefix: 'r"""',
        suffix: '"""', // Match the suffix with any number of spaces and newline
      })

      expect(result).toEqual({
        prefix: 'r"""',
        between: "  Module description\n\n",
        suffix: '"""',
      })
    })
  })

  describe("Edge cases", () => {
    it("should handle empty content", () => {
      const result = delimitString('""""""', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: '"""',
        between: "",
        suffix: '"""',
      })
    })

    it("should handle content with only whitespace", () => {
      const result = delimitString('"""   """', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: '"""',
        between: "   ",
        suffix: '"""',
      })
    })

    it("should handle no match - return original text as between", () => {
      const result = delimitString("No delimiters here", {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: "",
        between: "No delimiters here",
        suffix: "",
      })
    })

    it("should handle only prefix match", () => {
      const result = delimitString('"""No closing delimiter', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: "",
        between: '"""No closing delimiter',
        suffix: "",
      })
    })

    it("should handle only suffix match", () => {
      const result = delimitString('No opening delimiter"""', {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result).toEqual({
        prefix: "",
        between: 'No opening delimiter"""',
        suffix: "",
      })
    })
  })

  describe("Other delimiter patterns", () => {
    it("should handle single quotes", () => {
      const result = delimitString("'string content'", {
        prefix: "'",
        suffix: "'",
      })

      expect(result).toEqual({
        prefix: "'",
        between: "string content",
        suffix: "'",
      })
    })

    it("should handle HTML comments", () => {
      const result = delimitString("<!-- HTML comment -->", {
        prefix: "<!--",
        suffix: "-->",
      })

      expect(result).toEqual({
        prefix: "<!--",
        between: " HTML comment ",
        suffix: "-->",
      })
    })

    it("should handle JavaScript JSDoc", () => {
      const result = delimitString("/** JSDoc comment */", {
        prefix: "/**",
        suffix: "*/",
      })

      expect(result).toEqual({
        prefix: "/**",
        between: " JSDoc comment ",
        suffix: "*/",
      })
    })
  })

  describe("Performance and robustness", () => {
    it("should handle very long content", () => {
      const longContent = "a".repeat(1000)
      const text = `"""${longContent}"""`

      const result = delimitString(text, {
        prefix: '"""',
        suffix: '"""',
      })

      expect(result.between).toHaveLength(1000)
      expect(result.between).toBe(longContent)
    })

    it("should handle regex special characters in content", () => {
      const result = delimitString(
        '"""Content with [regex] (special) chars"""',
        {
          prefix: '"""',
          suffix: '"""',
        }
      )

      expect(result.between).toBe("Content with [regex] (special) chars")
    })
  })
})

describe("delimitStringWithRegex", () => {
  it("should parse simple triple-quoted docstring", () => {
    const result = delimitStringWithRegex('"""Module description"""', {
      prefix: /"""/,
      suffix: /"""/,
    })

    expect(result).toEqual({
      prefix: '"""',
      between: "Module description",
      suffix: '"""',
    })
  })

  it("should parse raw triple-quoted docstring", () => {
    const result = delimitStringWithRegex('r"""Module description"""', {
      prefix: /r"""/,
      suffix: /"""/,
    })

    expect(result).toEqual({
      prefix: 'r"""',
      between: "Module description",
      suffix: '"""',
    })
  })

  it("should parse hash comment with a space", () => {
    const result = delimitStringWithRegex("# This is a comment", {
      prefix: /#\s*/,
      suffix: /(?:)/,
    })

    expect(result).toEqual({
      prefix: "# ",
      between: "This is a comment",
      suffix: "",
    })
  })

  it("should parse hash comment without a space", () => {
    const result = delimitStringWithRegex("#This is a comment", {
      prefix: /#\s*/,
      suffix: EMPTY_PATTERN,
    })

    expect(result).toEqual({
      prefix: "#",
      between: "This is a comment",
      suffix: "",
    })
  })
})

describe("delimitWithSpaceConsumer", () => {
  it("should consume spaces", () => {
    const result = delimitWithSpaceConsumer("   This is a comment   ")
    expect(result).toEqual({
      prefix: "   ",
      between: "This is a comment",
      suffix: "   ",
    })
  })
  it("should consume newlines", () => {
    const result = delimitWithSpaceConsumer("\nThis is a comment\n\n")
    expect(result).toEqual({
      prefix: "\n",
      between: "This is a comment",
      suffix: "\n\n",
    })
  })
  it("should consume spaces and newlines", () => {
    const result = delimitWithSpaceConsumer(" \n This is a comment\n\n   ")
    expect(result).toEqual({
      prefix: " \n ",
      between: "This is a comment",
      suffix: "\n\n   ",
    })
  })
})
