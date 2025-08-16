import { describe, it, expect } from "vitest";
import { parseDelimitedString } from "@/lib/parser/delimited-string";

describe("parseDelimitedString", () => {
  describe("Python docstrings", () => {
    it("should parse simple triple-quoted docstring", () => {
      const result = parseDelimitedString('"""Module description"""', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: '"""',
        between: "Module description",
        suffix: '"""',
      });
    });

    it("should parse raw triple-quoted docstring", () => {
      const result = parseDelimitedString('r"""Module description"""', {
        prefixPattern: /^r"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: 'r"""',
        between: "Module description",
        suffix: '"""',
      });
    });

    it("should preserve trailing whitespace and newlines", () => {
      const result = parseDelimitedString('"""Module description"""\n\n', {
        prefixPattern: /^"""/,
        suffixPattern: /"""\n\n$/, // Match the exact suffix including newlines
      });

      expect(result).toEqual({
        prefix: '"""',
        between: "Module description",
        suffix: '"""\n\n',
      });
    });

    it("should preserve leading and trailing spaces in content", () => {
      const result = parseDelimitedString('"""  Module description  """', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: '"""',
        between: "  Module description  ",
        suffix: '"""',
      });
    });

    it("should handle complex docstring with mixed whitespace", () => {
      const result = parseDelimitedString(
        'r"""  Module description\n\n"""  \n',
        {
          prefixPattern: /^r"""/,
          suffixPattern: /"""\s*\n$/, // Match the suffix with any number of spaces and newline
        }
      );

      expect(result).toEqual({
        prefix: 'r"""',
        between: "  Module description\n\n",
        suffix: '"""  \n',
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle empty content", () => {
      const result = parseDelimitedString('""""""', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: '"""',
        between: "",
        suffix: '"""',
      });
    });

    it("should handle content with only whitespace", () => {
      const result = parseDelimitedString('"""   """', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: '"""',
        between: "   ",
        suffix: '"""',
      });
    });

    it("should handle no match - return original text as between", () => {
      const result = parseDelimitedString("No delimiters here", {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: "",
        between: "No delimiters here",
        suffix: "",
      });
    });

    it("should handle only prefix match", () => {
      const result = parseDelimitedString('"""No closing delimiter', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: "",
        between: '"""No closing delimiter',
        suffix: "",
      });
    });

    it("should handle only suffix match", () => {
      const result = parseDelimitedString('No opening delimiter"""', {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result).toEqual({
        prefix: "",
        between: 'No opening delimiter"""',
        suffix: "",
      });
    });
  });

  describe("Other delimiter patterns", () => {
    it("should handle single quotes", () => {
      const result = parseDelimitedString("'string content'", {
        prefixPattern: /^'/,
        suffixPattern: /'$/,
      });

      expect(result).toEqual({
        prefix: "'",
        between: "string content",
        suffix: "'",
      });
    });

    it("should handle HTML comments", () => {
      const result = parseDelimitedString("<!-- HTML comment -->", {
        prefixPattern: /^<!--/,
        suffixPattern: /-->$/,
      });

      expect(result).toEqual({
        prefix: "<!--",
        between: " HTML comment ",
        suffix: "-->",
      });
    });

    it("should handle JavaScript JSDoc", () => {
      const result = parseDelimitedString("/** JSDoc comment */", {
        prefixPattern: /^\/\*\*/,
        suffixPattern: /\*\/$/,
      });

      expect(result).toEqual({
        prefix: "/**",
        between: " JSDoc comment ",
        suffix: "*/",
      });
    });
  });

  describe("Performance and robustness", () => {
    it("should handle very long content", () => {
      const longContent = "a".repeat(1000);
      const text = `"""${longContent}"""`;

      const result = parseDelimitedString(text, {
        prefixPattern: /^"""/,
        suffixPattern: /"""$/,
      });

      expect(result.between).toHaveLength(1000);
      expect(result.between).toBe(longContent);
    });

    it("should handle regex special characters in content", () => {
      const result = parseDelimitedString(
        '"""Content with [regex] (special) chars"""',
        {
          prefixPattern: /^"""/,
          suffixPattern: /"""$/,
        }
      );

      expect(result.between).toBe("Content with [regex] (special) chars");
    });
  });
});
