import { describe, expect, it } from "vitest"

import {
  delimitPythonComment,
  delimitPythonDocString,
  stripPythonCommentPrefixes,
} from "@/lib/parser/python/delimit"

describe("delimitPythonComment", () => {
  it("should delimit an inline comment", () => {
    const result = delimitPythonComment("# This is a comment")
    expect(result).toEqual({
      prefix: "# ",
      between: "This is a comment",
      suffix: "",
    })
  })
})

describe("delimitPythonDocString", () => {
  it("should delimit a docstring", () => {
    const result = delimitPythonDocString('"""docstring"""')
    expect(result).toEqual({
      prefix: '"""',
      between: "docstring",
      suffix: '"""',
    })
  })
})

describe("stripPythonCommentPrefixes", () => {
  it("should strip comment prefixes", () => {
    const result = stripPythonCommentPrefixes(
      "# This is a comment\n\n# Two lines\n#No space"
    )
    expect(result).toBe("This is a comment\n\nTwo lines\nNo space")
  })
})
