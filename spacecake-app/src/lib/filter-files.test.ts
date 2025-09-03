import { describe, expect, it } from "vitest"

import type { File, QuickOpenFileItem } from "@/types/workspace"
import { FileType } from "@/types/workspace"

import { filterAndSortFiles } from "./filter-files"

describe("filterAndSortFiles", () => {
  const mockFile = (path: string): File => ({
    path,
    name: path.split("/").pop()!,
    kind: "file",
    fileType: FileType.Plaintext,
    cid: "",
    etag: { mtimeMs: 0, size: 0 },
  })

  const mockItems: QuickOpenFileItem[] = [
    {
      file: mockFile("/user/home/docs/resume.doc"),
      relativePath: "docs/resume.doc",
      displayPath: "docs",
    },
    {
      file: mockFile("/user/home/docs/contract.doc"),
      relativePath: "docs/contract.doc",
      displayPath: "docs",
    },
    {
      file: mockFile("/user/home/images/photo.jpg"),
      relativePath: "images/photo.jpg",
      displayPath: "images",
    },
    {
      file: mockFile("/user/home/readme.md"),
      relativePath: "readme.md",
      displayPath: "",
    },
  ]

  it("should filter items based on the search query", () => {
    const query = "doc"
    const result = filterAndSortFiles(mockItems, query)
    expect(result).toHaveLength(2)
    expect(result[0].file.name).toBe("resume.doc") // Higher score for "doc"
    expect(result[1].file.name).toBe("contract.doc")
  })

  it("should return an empty array if the query is empty", () => {
    const query = ""
    const result = filterAndSortFiles(mockItems, query)
    expect(result).toHaveLength(0)
  })

  it("should return an empty array if no items match", () => {
    const query = "nonexistent"
    const result = filterAndSortFiles(mockItems, query)
    expect(result).toHaveLength(0)
  })

  it("should correctly sort based on score", () => {
    const query = "readme"
    const result = filterAndSortFiles(mockItems, query)
    expect(result).toHaveLength(1)
    expect(result[0].file.name).toBe("readme.md")
  })
})
