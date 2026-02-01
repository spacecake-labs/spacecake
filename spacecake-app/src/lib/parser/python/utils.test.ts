import { describe, expect, it } from "vitest"

import {
  addPythonMdocPrefixes,
  delimitPythonComment,
  delimitPythonDocString,
  stripPythonCommentPrefixes,
  stripPythonMdocPrefixes,
} from "@/lib/parser/python/utils"

describe("delimitPythonComment", () => {
  it("should delimit an inline comment", () => {
    const result = delimitPythonComment("# This is a comment")
    expect(result).toEqual({
      prefix: "# ",
      between: "This is a comment",
      suffix: "",
    })
  })

  it("should handle comment with no space after #", () => {
    const result = delimitPythonComment("#comment")
    expect(result).toEqual({
      prefix: "#",
      between: "comment",
      suffix: "",
    })
  })

  it("should handle comment with multiple spaces after #", () => {
    const result = delimitPythonComment("#   multiple spaces")
    expect(result).toEqual({
      prefix: "# ",
      between: "  multiple spaces",
      suffix: "",
    })
  })

  it("should handle empty comment", () => {
    const result = delimitPythonComment("#")
    expect(result).toEqual({
      prefix: "#",
      between: "",
      suffix: "",
    })
  })

  it("should handle comment with only spaces", () => {
    const result = delimitPythonComment("#   ")
    expect(result).toEqual({
      prefix: "# ",
      between: "  ",
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

  it("should handle empty docstring", () => {
    const result = delimitPythonDocString('""""""')
    expect(result).toEqual({
      prefix: '"""',
      between: "",
      suffix: '"""',
    })
  })

  it("should handle docstring with newlines", () => {
    const result = delimitPythonDocString('"""\nmulti\nline\n"""')
    expect(result).toEqual({
      prefix: '"""',
      between: "\nmulti\nline\n",
      suffix: '"""',
    })
  })

  it("should handle docstring with quotes inside", () => {
    const result = delimitPythonDocString('"""contains "quotes" inside"""')
    expect(result).toEqual({
      prefix: '"""',
      between: 'contains "quotes" inside',
      suffix: '"""',
    })
  })
})

describe("stripPythonCommentPrefixes", () => {
  it("should strip comment prefixes", () => {
    const result = stripPythonCommentPrefixes("# This is a comment\n\n# Two lines\n#No space")
    expect(result).toBe("This is a comment\n\nTwo lines\nNo space")
  })

  it("should handle empty string", () => {
    const result = stripPythonCommentPrefixes("")
    expect(result).toBe("")
  })

  it("should handle string with no comments", () => {
    const result = stripPythonCommentPrefixes("print('hello')\nprint('world')")
    expect(result).toBe("print('hello')\nprint('world')")
  })

  it("should handle comment at start of string", () => {
    const result = stripPythonCommentPrefixes("# Start comment\ncode here")
    expect(result).toBe("Start comment\ncode here")
  })

  it("should handle comment at end of string", () => {
    const result = stripPythonCommentPrefixes("code here\n# End comment")
    expect(result).toBe("code here\nEnd comment")
  })

  it("should handle multiple consecutive comment lines", () => {
    const result = stripPythonCommentPrefixes("# Line 1\n# Line 2\n# Line 3")
    expect(result).toBe("Line 1\nLine 2\nLine 3")
  })

  it("should handle comment with multiple spaces", () => {
    const result = stripPythonCommentPrefixes("#   Multiple spaces")
    expect(result).toBe("  Multiple spaces")
  })

  it("should preserve non-comment lines", () => {
    const result = stripPythonCommentPrefixes("def func():\n    # comment\n    return True")
    expect(result).toBe("def func():\n    # comment\n    return True")
  })
})

describe("stripPythonMdocPrefixes", () => {
  it("should strip mdoc prefixes", () => {
    const result = stripPythonMdocPrefixes("#🍰 mdoc content\n#🍰 another line")
    expect(result).toBe("mdoc content\nanother line")
  })

  it("should handle empty string", () => {
    const result = stripPythonMdocPrefixes("")
    expect(result).toBe("")
  })

  it("should handle string with no mdoc prefixes", () => {
    const result = stripPythonMdocPrefixes("regular text\nmore text")
    expect(result).toBe("regular text\nmore text")
  })

  it("should handle mdoc prefix with no space", () => {
    const result = stripPythonMdocPrefixes("#🍰no space")
    expect(result).toBe("no space")
  })

  it("should handle mdoc prefix with multiple spaces", () => {
    const result = stripPythonMdocPrefixes("#🍰   multiple spaces")
    expect(result).toBe("  multiple spaces")
  })

  it("should preserve regular comments", () => {
    const result = stripPythonMdocPrefixes("# regular comment\n#🍰 mdoc content")
    expect(result).toBe("# regular comment\nmdoc content")
  })

  it("should handle mixed content", () => {
    const result = stripPythonMdocPrefixes("code\n#🍰 mdoc\nmore code\n#🍰 more mdoc")
    expect(result).toBe("code\nmdoc\nmore code\nmore mdoc")
  })
})

describe("addPythonMdocPrefixes", () => {
  it("should add mdoc prefixes to single line", () => {
    const result = addPythonMdocPrefixes("single line")
    expect(result).toBe("#🍰 single line")
  })

  it("should add mdoc prefixes to multiple lines", () => {
    const result = addPythonMdocPrefixes("line 1\nline 2\nline 3")
    expect(result).toBe("#🍰 line 1\n#🍰 line 2\n#🍰 line 3")
  })

  it("should handle empty string", () => {
    const result = addPythonMdocPrefixes("")
    expect(result).toBe("#🍰 ")
  })

  it("should handle string with only newlines", () => {
    const result = addPythonMdocPrefixes("\n\n")
    expect(result).toBe("#🍰 \n#🍰 \n#🍰 ")
  })

  it("should handle string ending with newline", () => {
    const result = addPythonMdocPrefixes("content\n")
    expect(result).toBe("#🍰 content\n#🍰 ")
  })

  it("should handle string starting with newline", () => {
    const result = addPythonMdocPrefixes("\ncontent")
    expect(result).toBe("#🍰 \n#🍰 content")
  })

  it("should preserve existing content exactly", () => {
    const input = "  indented text  \n  more indented  "
    const result = addPythonMdocPrefixes(input)
    expect(result).toBe("#🍰   indented text  \n#🍰   more indented  ")
  })
})
