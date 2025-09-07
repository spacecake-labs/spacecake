import { describe, expect, it } from "vitest"

import { condensePath } from "@/lib/utils"

describe("condensePath", () => {
  it("should condense Windows path with backslashes", () => {
    const path = "C:\\Users\\username\\Documents\\project\\data\\file.txt"
    const result = condensePath(path)
    expect(result).toBe("...\\data\\file.txt")
  })

  it("should condense Unix path with forward slashes", () => {
    const path = "/home/user/documents/my_project/app_code.js"
    const result = condensePath(path)
    expect(result).toBe(".../my_project/app_code.js")
  })

  it("should condense Windows path with forward slashes", () => {
    const path = "C:/Program Files/app.exe"
    const result = condensePath(path)
    expect(result).toBe(".../Program Files/app.exe")
  })

  it("should condense Unix path with two levels", () => {
    const path = "/var/log/nginx"
    const result = condensePath(path)
    expect(result).toBe(".../log/nginx")
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
