import { describe, expect, it } from "vitest"

import {
  resolveWikiLink,
  resolveWikiLinkIndexed,
  buildFileIndex,
  resolveSelfLink,
} from "@/lib/resolve-wikilink"
import type { IndexedFile } from "@/services/file-system"
import { isLeft, isRight } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

const files: IndexedFile[] = [
  { path: "/home/user/projects/vault/notes/hello.md", name: "hello.md" },
  { path: "/home/user/projects/vault/docs/setup.md", name: "setup.md" },
  { path: "/home/user/projects/vault/readme.md", name: "readme.md" },
  { path: "/home/user/projects/vault/image.png", name: "image.png" },
  // duplicate name at different depths for ambiguity / shortest-path tests
  { path: "/home/user/projects/vault/draft.md", name: "draft.md" },
  { path: "/home/user/projects/vault/archive/old/draft.md", name: "draft.md" },
  // same-length paths for true ambiguity
  { path: "/home/user/projects/vault/a/dup.md", name: "dup.md" },
  { path: "/home/user/projects/vault/b/dup.md", name: "dup.md" },
]

describe("resolveWikiLink", () => {
  it("resolves a basic filename match", () => {
    const result = resolveWikiLink("hello", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
      expect(result.value.anchor).toBeNull()
    }
  })

  it("resolves with explicit .md extension", () => {
    const result = resolveWikiLink("hello.md", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
    }
  })

  it("resolves case-insensitively", () => {
    const result = resolveWikiLink("Hello", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
    }
  })

  it("resolves non-markdown files by exact name", () => {
    const result = resolveWikiLink("image.png", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/image.png")
    }
  })

  it("prefers shortest path when multiple files share the same name", () => {
    const result = resolveWikiLink("draft", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/draft.md")
    }
  })

  it("returns ambiguous when multiple matches have the same path length", () => {
    const result = resolveWikiLink("dup", files)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("ambiguous")
      expect(result.value.target).toBe("dup")
    }
  })

  it("returns not-found for a missing file", () => {
    const result = resolveWikiLink("nonexistent", files)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("not-found")
    }
  })

  it("parses a heading anchor", () => {
    const result = resolveWikiLink("hello#introduction", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
      expect(result.value.anchor).toEqual({ kind: "heading", value: "introduction" })
    }
  })

  it("parses a block anchor", () => {
    const result = resolveWikiLink("hello#^abc123", files)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
      expect(result.value.anchor).toEqual({ kind: "block", value: "abc123" })
    }
  })

  it("returns self-link for same-file heading link (caller handles separately)", () => {
    const result = resolveWikiLink("#some-heading", files)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("self-link")
    }
  })

  it("returns self-link for empty target", () => {
    const result = resolveWikiLink("", files)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("self-link")
    }
  })
})

describe("resolveWikiLinkIndexed", () => {
  const index = buildFileIndex(files)

  it("resolves a basic filename match", () => {
    const result = resolveWikiLinkIndexed("hello", index)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/notes/hello.md")
      expect(result.value.anchor).toBeNull()
    }
  })

  it("prefers shortest path when multiple files share the same name", () => {
    const result = resolveWikiLinkIndexed("draft", index)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.filePath).toBe("/home/user/projects/vault/draft.md")
    }
  })

  it("returns ambiguous when multiple matches have the same path length", () => {
    const result = resolveWikiLinkIndexed("dup", index)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("ambiguous")
    }
  })

  it("returns not-found for a missing file", () => {
    const result = resolveWikiLinkIndexed("nonexistent", index)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("not-found")
    }
  })

  it("returns self-link for same-file heading link", () => {
    const result = resolveWikiLinkIndexed("#heading", index)
    expect(isLeft(result)).toBe(true)
    if (isLeft(result)) {
      expect(result.value.reason).toBe("self-link")
    }
  })

  it("parses heading anchors", () => {
    const result = resolveWikiLinkIndexed("hello#intro", index)
    expect(isRight(result)).toBe(true)
    if (isRight(result)) {
      expect(result.value.anchor).toEqual({ kind: "heading", value: "intro" })
    }
  })
})

describe("buildFileIndex", () => {
  const index = buildFileIndex(files)

  it("groups files by normalized name", () => {
    expect(index.get("draft")).toHaveLength(2)
    expect(index.get("hello")).toHaveLength(1)
    expect(index.get("dup")).toHaveLength(2)
  })

  it("normalizes keys to lowercase without .md", () => {
    expect(index.has("hello")).toBe(true)
    expect(index.has("hello.md")).toBe(false)
    expect(index.has("Hello")).toBe(false)
  })

  it("preserves non-md extensions in key", () => {
    expect(index.has("image.png")).toBe(true)
  })
})

describe("resolveSelfLink", () => {
  it("creates a resolved link with the current file path and heading anchor", () => {
    const currentFile = AbsolutePath("/home/user/projects/vault/notes/hello.md")
    const result = resolveSelfLink(currentFile, { kind: "heading", value: "intro" })
    expect(result.filePath).toBe(currentFile)
    expect(result.anchor).toEqual({ kind: "heading", value: "intro" })
  })

  it("creates a resolved link with the current file path and block anchor", () => {
    const currentFile = AbsolutePath("/home/user/projects/vault/notes/hello.md")
    const result = resolveSelfLink(currentFile, { kind: "block", value: "ref1" })
    expect(result.filePath).toBe(currentFile)
    expect(result.anchor).toEqual({ kind: "block", value: "ref1" })
  })
})
