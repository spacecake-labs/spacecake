import { describe, expect, it } from "vitest"

import type { RecentFile } from "@/types/storage"
import {
  AbsolutePath,
  FileType,
  type File,
  type QuickOpenFileItem,
} from "@/types/workspace"
import {
  sortFilesByMatchingScore,
  sortFilesByRecency,
} from "@/lib/filter-files"

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
