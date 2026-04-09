import { describe, expect, it } from "vitest"

import { normalizeAnchor } from "@/lib/scroll-to-anchor"

describe("normalizeAnchor", () => {
  it("lowercases text", () => {
    expect(normalizeAnchor("Features")).toBe("features")
  })

  it("replaces spaces with hyphens", () => {
    expect(normalizeAnchor("my cool feature")).toBe("my-cool-feature")
  })

  it("strips special characters", () => {
    expect(normalizeAnchor("hello world!")).toBe("hello-world")
  })

  it("collapses consecutive hyphens", () => {
    expect(normalizeAnchor("hello - - world")).toBe("hello-world")
  })

  it("trims leading and trailing whitespace", () => {
    expect(normalizeAnchor("  hello  ")).toBe("hello")
  })

  it("strips leading and trailing hyphens after normalization", () => {
    expect(normalizeAnchor("!hello!")).toBe("hello")
  })

  it("preserves underscores", () => {
    expect(normalizeAnchor("my_feature")).toBe("my_feature")
  })

  it("handles mixed case with special characters", () => {
    expect(normalizeAnchor("My Cool Feature!")).toBe("my-cool-feature")
  })

  it("handles already-normalized slugs", () => {
    expect(normalizeAnchor("already-normalized")).toBe("already-normalized")
  })

  it("handles empty string", () => {
    expect(normalizeAnchor("")).toBe("")
  })

  it("handles numbers", () => {
    expect(normalizeAnchor("step 1: setup")).toBe("step-1-setup")
  })

  it("handles multiple spaces", () => {
    expect(normalizeAnchor("hello   world")).toBe("hello-world")
  })

  it("handles parentheses and brackets", () => {
    expect(normalizeAnchor("setup (optional)")).toBe("setup-optional")
  })

  it("handles unicode characters by stripping them", () => {
    expect(normalizeAnchor("café")).toBe("caf")
  })
})
