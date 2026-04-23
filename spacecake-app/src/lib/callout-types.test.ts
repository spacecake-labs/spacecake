import { describe, expect, it } from "vitest"

import { getDefaultTitle, normalizeCalloutType } from "@/lib/callout-types"

describe("normalizeCalloutType", () => {
  it("returns canonical types unchanged", () => {
    expect(normalizeCalloutType("note")).toBe("note")
    expect(normalizeCalloutType("warning")).toBe("warning")
    expect(normalizeCalloutType("danger")).toBe("danger")
  })

  it("is case-insensitive", () => {
    expect(normalizeCalloutType("NOTE")).toBe("note")
    expect(normalizeCalloutType("Warning")).toBe("warning")
    expect(normalizeCalloutType("IMPORTANT")).toBe("tip")
  })

  it("resolves aliases to canonical types", () => {
    expect(normalizeCalloutType("summary")).toBe("abstract")
    expect(normalizeCalloutType("tldr")).toBe("abstract")
    expect(normalizeCalloutType("hint")).toBe("tip")
    expect(normalizeCalloutType("important")).toBe("tip")
    expect(normalizeCalloutType("check")).toBe("success")
    expect(normalizeCalloutType("done")).toBe("success")
    expect(normalizeCalloutType("help")).toBe("question")
    expect(normalizeCalloutType("faq")).toBe("question")
    expect(normalizeCalloutType("caution")).toBe("warning")
    expect(normalizeCalloutType("attention")).toBe("warning")
    expect(normalizeCalloutType("fail")).toBe("failure")
    expect(normalizeCalloutType("missing")).toBe("failure")
    expect(normalizeCalloutType("error")).toBe("danger")
    expect(normalizeCalloutType("cite")).toBe("quote")
  })

  it("falls back to note for unknown types", () => {
    expect(normalizeCalloutType("unknown")).toBe("note")
    expect(normalizeCalloutType("xyzzy")).toBe("note")
    expect(normalizeCalloutType("")).toBe("note")
  })
})

describe("getDefaultTitle", () => {
  it("capitalizes the canonical type name", () => {
    expect(getDefaultTitle("note")).toBe("Note")
    expect(getDefaultTitle("warning")).toBe("Warning")
    expect(getDefaultTitle("abstract")).toBe("Abstract")
  })
})
