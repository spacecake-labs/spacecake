import { describe, expect, it } from "vitest"

import { condensePath, filename } from "@/lib/utils"

describe("condensePath", () => {
  it("should condense Windows path with backslashes", () => {
    const path = "C:\\Users\\username\\Documents\\project\\data\\file.txt"
    const result = condensePath(path)
    expect(result).toBe("data\\file.txt")
  })

  it("should condense Unix path with forward slashes", () => {
    const path = "/home/user/documents/my_project/app_code.js"
    const result = condensePath(path)
    expect(result).toBe("my_project/app_code.js")
  })

  it("should condense Windows path with forward slashes", () => {
    const path = "C:/Program Files/app.exe"
    const result = condensePath(path)
    expect(result).toBe("Program Files/app.exe")
  })

  it("should condense Unix path with two levels", () => {
    const path = "/var/log/nginx"
    const result = condensePath(path)
    expect(result).toBe("log/nginx")
  })

  it("should not condense short paths", () => {
    const path = "Users/document.txt"
    const result = condensePath(path)
    expect(result).toBe("Users/document.txt")
  })

  it("should handle empty paths", () => {
    const path = ""
    const result = condensePath(path)
    expect(result).toBe("")
  })
})

describe("filename", () => {
  it("should extract filename from Unix path", () => {
    const path = "/path/to/file.py"
    const result = filename(path)
    expect(result).toBe("file.py")
  })

  it("should extract filename from Windows path with backslashes", () => {
    const path = "C:\\Users\\username\\Documents\\file.txt"
    const result = filename(path)
    expect(result).toBe("file.txt")
  })

  it("should extract filename from Windows path with forward slashes", () => {
    const path = "C:/Program Files/app.exe"
    const result = filename(path)
    expect(result).toBe("app.exe")
  })

  it("should handle simple filename without path", () => {
    const path = "simple.txt"
    const result = filename(path)
    expect(result).toBe("simple.txt")
  })

  it("should handle empty path", () => {
    const path = ""
    const result = filename(path)
    expect(result).toBe("")
  })

  it("should handle path with trailing slash", () => {
    const path = "/path/to/folder/"
    const result = filename(path)
    expect(result).toBe("folder")
  })

  it("should handle mixed separators", () => {
    const path = "/path\\to/mixed\\file.py"
    const result = filename(path)
    expect(result).toBe("file.py")
  })
})
