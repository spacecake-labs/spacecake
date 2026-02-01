import { describe, expect, it } from "vitest"

import type { RecentFile } from "@/types/storage"

import {
  createQuickOpenItems,
  RECENCY_BOOST,
  sortFilesByMatchingScore,
  sortFilesByRecency,
} from "@/lib/filter-files"
import { AbsolutePath, FileType, type File, type QuickOpenFileItem } from "@/types/workspace"

describe("sortFilesByMatchingScore", () => {
  const mockFile = (path: AbsolutePath): File => ({
    path,
    name: path.split("/").pop()!,
    kind: "file",
    fileType: FileType.Plaintext,
    cid: "",
    etag: { mtime: new Date(0), size: 0 },
  })

  const mockItems: QuickOpenFileItem[] = [
    {
      file: mockFile(AbsolutePath("/user/home/docs/resume.doc")),
      displayPath: "docs",
    },
    {
      file: mockFile(AbsolutePath("/user/home/docs/contract.doc")),
      displayPath: "docs",
    },
    {
      file: mockFile(AbsolutePath("/user/home/images/photo.jpg")),
      displayPath: "images",
    },
    {
      file: mockFile(AbsolutePath("/user/home/readme.md")),
      displayPath: "",
    },
  ]

  it("should filter items based on the search query", () => {
    const query = "doc"
    const result = sortFilesByMatchingScore(mockItems, query)
    expect(result).toHaveLength(2)
    expect(result[0].file.name).toBe("resume.doc") // Higher score for "doc"
    expect(result[1].file.name).toBe("contract.doc")
  })

  it("should return an empty array if the query is empty", () => {
    const query = ""
    const result = sortFilesByMatchingScore(mockItems, query)
    expect(result).toHaveLength(0)
  })

  it("should return an empty array if no items match", () => {
    const query = "nonexistent"
    const result = sortFilesByMatchingScore(mockItems, query)
    expect(result).toHaveLength(0)
  })

  it("should correctly sort based on score", () => {
    const query = "readme"
    const result = sortFilesByMatchingScore(mockItems, query)
    expect(result).toHaveLength(1)
    expect(result[0].file.name).toBe("readme.md")
  })
})

describe("sortFilesByRecency", () => {
  const mockRecentFile = (name: string, lastAccessed: number): RecentFile => ({
    name,
    path: AbsolutePath(`/workspace/${name}`),
    fileType: FileType.Plaintext,
    lastAccessed,
    workspacePath: AbsolutePath("/workspace"),
  })

  it("should sort recent files by most recent first", () => {
    const recentFiles: RecentFile[] = [
      mockRecentFile("old-file.txt", 1000), // oldest
      mockRecentFile("new-file.txt", 3000), // newest
      mockRecentFile("middle-file.txt", 2000), // middle
    ]

    const result = sortFilesByRecency(recentFiles)

    expect(result).toHaveLength(3)
    expect(result[0].name).toBe("new-file.txt") // most recent first
    expect(result[1].name).toBe("middle-file.txt")
    expect(result[2].name).toBe("old-file.txt") // least recent last
  })

  it("should handle empty array", () => {
    const result = sortFilesByRecency([])
    expect(result).toHaveLength(0)
  })

  it("should handle single file", () => {
    const recentFiles: RecentFile[] = [mockRecentFile("single-file.txt", 1000)]

    const result = sortFilesByRecency(recentFiles)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("single-file.txt")
  })

  it("should handle files with same timestamp", () => {
    const timestamp = 2000
    const recentFiles: RecentFile[] = [
      mockRecentFile("file1.txt", timestamp),
      mockRecentFile("file2.txt", timestamp),
      mockRecentFile("file3.txt", timestamp),
    ]

    const result = sortFilesByRecency(recentFiles)

    expect(result).toHaveLength(3)
    // Order should be stable (same as input order for equal timestamps)
    expect(result[0].name).toBe("file1.txt")
    expect(result[1].name).toBe("file2.txt")
    expect(result[2].name).toBe("file3.txt")
  })
})

describe("sortFilesByMatchingScore with recency", () => {
  const mockFile = (path: AbsolutePath): File => ({
    path,
    name: path.split("/").pop()!,
    kind: "file",
    fileType: FileType.Plaintext,
    cid: "",
    etag: { mtime: new Date(0), size: 0 },
  })

  const mockItem = (path: string): QuickOpenFileItem => ({
    file: mockFile(AbsolutePath(path)),
    displayPath: "",
  })

  it("should boost recent files in search results", () => {
    const items = [mockItem("/workspace/file1.txt"), mockItem("/workspace/file2.txt")]
    const recentPaths = new Set(["/workspace/file2.txt"])

    const result = sortFilesByMatchingScore(items, "file", recentPaths)

    expect(result).toHaveLength(2)
    // file2 should be boosted above file1 due to recency
    expect(result[0].file.name).toBe("file2.txt")
    expect(result[1].file.name).toBe("file1.txt")
  })

  it("should not let recency override significantly better matches", () => {
    // This is the key test: exact match should beat a poor fuzzy match
    // even if the fuzzy match was recently opened
    // Both files end in .md so they both match the query "md"
    const items = [mockItem("/workspace/.app/getting-started.md"), mockItem("/workspace/README.md")]
    const recentPaths = new Set(["/workspace/.app/getting-started.md"])

    // Query "readme" - README.md matches much better than getting-started.md
    const result = sortFilesByMatchingScore(items, "readme", recentPaths)

    // README.md should come first because it's a much better match
    // even though getting-started.md was recently opened
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].file.name).toBe("README.md")
  })

  it("should only return exact match when query matches one file exactly", () => {
    // Searching for exact filename should only return that file,
    // not a recently opened file that doesn't match
    const items = [mockItem("/workspace/.app/getting-started.md"), mockItem("/workspace/README.md")]
    const recentPaths = new Set(["/workspace/.app/getting-started.md"])

    const result = sortFilesByMatchingScore(items, "README.md", recentPaths)

    // Only README.md should match - getting-started.md has no overlap
    expect(result).toHaveLength(1)
    expect(result[0].file.name).toBe("README.md")
  })

  it("should apply recency boost correctly - value check", () => {
    // Verify the boost constant is reasonable
    expect(RECENCY_BOOST).toBeGreaterThan(1)
    expect(RECENCY_BOOST).toBeLessThan(1.5) // Not too aggressive
  })

  it("should return empty array for empty query", () => {
    const items = [mockItem("/workspace/file.txt")]
    const result = sortFilesByMatchingScore(items, "", new Set())
    expect(result).toHaveLength(0)
  })
})

describe("createQuickOpenItems", () => {
  const workspacePath = AbsolutePath("/workspace")

  const mockFile = (path: AbsolutePath, isGitIgnored = false): File => ({
    path,
    name: path.split("/").pop()!,
    kind: "file",
    fileType: FileType.Plaintext,
    cid: "",
    etag: { mtime: new Date(0), size: 0 },
    isGitIgnored,
  })

  const mockItem = (path: string, isGitIgnored = false): QuickOpenFileItem => ({
    file: mockFile(AbsolutePath(path), isGitIgnored),
    displayPath: "",
  })

  const mockRecentFile = (name: string, lastAccessed: number): RecentFile => ({
    name,
    path: AbsolutePath(`/workspace/${name}`),
    fileType: FileType.Plaintext,
    lastAccessed,
    workspacePath,
  })

  it("should show only recent files when search is empty", () => {
    const allFiles = [
      mockItem("/workspace/file1.txt"),
      mockItem("/workspace/file2.txt"),
      mockItem("/workspace/file3.txt"),
    ]
    const recentFiles = [mockRecentFile("file2.txt", 2000), mockRecentFile("file1.txt", 1000)]

    const result = createQuickOpenItems(allFiles, recentFiles, "", workspacePath)

    expect(result).toHaveLength(2)
    expect(result[0].file.name).toBe("file2.txt") // Most recent first
    expect(result[1].file.name).toBe("file1.txt")
  })

  it("should prioritize exact match over recently opened fuzzy match", () => {
    // THE BUG SCENARIO: getting-started.md (recent) vs README.md (exact match)
    const allFiles = [
      mockItem("/workspace/.app/getting-started.md"),
      mockItem("/workspace/README.md"),
      mockItem("/workspace/other-file.txt"),
    ]
    const recentFiles = [
      mockRecentFile("getting-started.md", 3000), // Recently opened
    ]

    const result = createQuickOpenItems(allFiles, recentFiles, "README", workspacePath)

    // README.md should come first because it's a much better match
    // even though getting-started.md was recently opened
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].file.name).toBe("README.md")
  })

  it("should boost recent file when match quality is similar", () => {
    const allFiles = [mockItem("/workspace/file-alpha.txt"), mockItem("/workspace/file-beta.txt")]
    const recentFiles = [mockRecentFile("file-beta.txt", 2000)]

    const result = createQuickOpenItems(allFiles, recentFiles, "file", workspacePath)

    expect(result).toHaveLength(2)
    // Both match "file" similarly, but file-beta is recent so it should be first
    expect(result[0].file.name).toBe("file-beta.txt")
  })

  it("should filter out gitignored files unless recently opened", () => {
    const allFiles = [
      mockItem("/workspace/normal.txt"),
      mockItem("/workspace/ignored.txt", true), // gitignored
      mockItem("/workspace/ignored-but-recent.txt", true), // gitignored but recent
    ]
    const recentFiles = [mockRecentFile("ignored-but-recent.txt", 2000)]

    const result = createQuickOpenItems(allFiles, recentFiles, "txt", workspacePath)

    const names = result.map((r) => r.file.name)
    expect(names).toContain("normal.txt")
    expect(names).not.toContain("ignored.txt")
    expect(names).toContain("ignored-but-recent.txt")
  })
})
