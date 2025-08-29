import { Option } from "effect"
import { describe, expect, it } from "vitest"

import { parseDirective, parsePythonDirective } from "@/lib/parser/directives"

describe("parseDirective", () => {
  it("should parse a markdown block directive", () => {
    const directive = Option.getOrNull(parseDirective("@md :: some content"))
    expect(directive).toEqual({
      kind: "markdown block",
      content: {
        prefix: "",
        between: "some content",
        suffix: "",
      },
    })
  })

  it("should parse a markdown inline directive", () => {
    const directive = Option.getOrNull(parseDirective("@md : some content"))
    expect(directive).toEqual({
      kind: "markdown inline",
      content: {
        prefix: "",
        between: "some content",
        suffix: "",
      },
    })
  })
})

describe("parsePythonDirective", () => {
  it("should parse a Python markdown block directive", () => {
    const directive = Option.getOrNull(
      parsePythonDirective("# @md :: some content")
    )
    expect(directive).toEqual({
      kind: "markdown block",
      content: {
        prefix: "# ",
        between: "some content",
        suffix: "",
      },
    })
  })

  it("should parse a Python markdown inline directive", () => {
    const directive = Option.getOrNull(
      parsePythonDirective("# @md : some content")
    )
    expect(directive).toEqual({
      kind: "markdown inline",
      content: {
        prefix: "# ",
        between: "some content",
        suffix: "",
      },
    })
  })
})
