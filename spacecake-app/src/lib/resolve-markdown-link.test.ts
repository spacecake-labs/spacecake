import { describe, expect, it } from "vitest"

import { isInternalLink, resolveMarkdownLinkHref } from "@/lib/resolve-markdown-link"

describe("isInternalLink", () => {
  it.each([
    ["https://example.com", false],
    ["http://example.com", false],
    ["mailto:user@host", false],
    ["tel:+1234567890", false],
    ["ftp://files.example.com", false],
    ["data:text/html,<h1>hi</h1>", false],
    ["javascript:alert(1)", false],
    ["HTTPS://EXAMPLE.COM", false],
    ["file:///path/to/file", false],
  ])("returns false for external URL: %s", (href, expected) => {
    expect(isInternalLink(href)).toBe(expected)
  })

  it.each([
    ["file.md", true],
    ["./file.md", true],
    ["../file.md", true],
    ["subdir/file.md", true],
    ["#heading", true],
    ["file.md#heading", true],
    ["/absolute/file.md", true],
    ["file.md#^block-id", true],
  ])("returns true for internal link: %s", (href, expected) => {
    expect(isInternalLink(href)).toBe(expected)
  })

  it.each([
    ["", false],
    [" ", false],
    ["  \t  ", false],
  ])("returns false for empty/whitespace: %j", (href, expected) => {
    expect(isInternalLink(href)).toBe(expected)
  })
})

describe("resolveMarkdownLinkHref", () => {
  const ws = "/workspace"
  const current = "/workspace/docs/readme.md"

  it("resolves a simple filename relative to the current file", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file.md")).toEqual({
      filePath: "/workspace/docs/file.md",
    })
  })

  it("resolves a dot-relative path", () => {
    expect(resolveMarkdownLinkHref(current, ws, "./file.md")).toEqual({
      filePath: "/workspace/docs/file.md",
    })
  })

  it("resolves a parent-relative path", () => {
    expect(resolveMarkdownLinkHref(current, ws, "../file.md")).toEqual({
      filePath: "/workspace/file.md",
    })
  })

  it("resolves a nested subdirectory path", () => {
    expect(resolveMarkdownLinkHref(current, ws, "sub/file.md")).toEqual({
      filePath: "/workspace/docs/sub/file.md",
    })
  })

  it("extracts a heading anchor", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file.md#heading")).toEqual({
      filePath: "/workspace/docs/file.md",
      anchor: "heading",
    })
  })

  it("extracts a block anchor", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file.md#^block-id")).toEqual({
      filePath: "/workspace/docs/file.md",
      anchor: "^block-id",
    })
  })

  it("resolves a same-file anchor", () => {
    expect(resolveMarkdownLinkHref(current, ws, "#heading")).toEqual({
      filePath: current,
      anchor: "heading",
    })
  })

  it("URL-decodes the path portion", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file%20name.md")).toEqual({
      filePath: "/workspace/docs/file name.md",
    })
  })

  it("resolves a workspace-root-relative path", () => {
    expect(resolveMarkdownLinkHref(current, ws, "/notes/file.md")).toEqual({
      filePath: "/workspace/notes/file.md",
    })
  })

  it("resolves double-parent navigation", () => {
    const deep = "/workspace/a/b/c.md"
    expect(resolveMarkdownLinkHref(deep, ws, "../../file.md")).toEqual({
      filePath: "/workspace/file.md",
    })
  })

  it("clamps path traversal to workspace root", () => {
    expect(resolveMarkdownLinkHref(current, ws, "../../../../etc/passwd")).toEqual({
      filePath: ws,
    })
  })

  it("treats encoded # in filename as part of the path, not an anchor", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file%23name.md")).toEqual({
      filePath: "/workspace/docs/file#name.md",
    })
  })

  it("handles anchor-only with block reference", () => {
    expect(resolveMarkdownLinkHref(current, ws, "#^important")).toEqual({
      filePath: current,
      anchor: "^important",
    })
  })

  it("URL-decodes the anchor portion", () => {
    expect(resolveMarkdownLinkHref(current, ws, "file.md#my%20heading")).toEqual({
      filePath: "/workspace/docs/file.md",
      anchor: "my heading",
    })
  })
})
