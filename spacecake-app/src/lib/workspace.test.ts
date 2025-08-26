import { describe, expect, test } from "vitest"

import { FileType } from "@/types/workspace"
import { fileTypeEmoji, fileTypeFromLanguage } from "@/lib/workspace"

// fileTypeEmoji tests

describe("fileTypeEmoji", () => {
  test.each([
    [FileType.Markdown, "📖"],
    [FileType.Python, "🐍"],
    [FileType.JavaScript, "🟡"],
    [FileType.TypeScript, "🔵"],
    [FileType.JSX, "🟡"],
    [FileType.TSX, "🔵"],
    [FileType.Plaintext, "📄"],
  ])("returns correct emoji for %s", (fileType, expectedEmoji) => {
    expect(fileTypeEmoji(fileType)).toBe(expectedEmoji)
  })
})

// fileTypeFromLanguage tests

describe("fileTypeFromLanguage", () => {
  test.each([
    ["python", FileType.Python],
    ["Python", FileType.Python],
    ["PYTHON", FileType.Python],
    ["javascript", FileType.JavaScript],
    ["JavaScript", FileType.JavaScript],
    ["typescript", FileType.TypeScript],
    ["TypeScript", FileType.TypeScript],
    ["markdown", FileType.Markdown],
    ["Markdown", FileType.Markdown],
  ])("returns correct FileType for language: %s", (language, expectedType) => {
    expect(fileTypeFromLanguage(language)).toBe(expectedType)
  })

  test.each([
    ["java", FileType.Plaintext],
    ["c++", FileType.Plaintext],
    ["unknown", FileType.Plaintext],
    ["", FileType.Plaintext],
  ])(
    "returns Plaintext for unsupported languages: %s",
    (language, expectedType) => {
      expect(fileTypeFromLanguage(language)).toBe(expectedType)
    }
  )
})
