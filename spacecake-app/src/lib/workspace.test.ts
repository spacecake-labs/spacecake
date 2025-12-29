import { describe, expect, test } from "vitest"

import { FileType } from "@/types/workspace"
import {
  fileExtension,
  fileTypeEmoji,
  fileTypeFromFileName,
  fileTypeFromLanguage,
} from "@/lib/workspace"

// fileTypeEmoji tests

describe("fileTypeEmoji", () => {
  test.each([
    [FileType.Markdown, "📖"],
    [FileType.Python, "🐍"],
    [FileType.JavaScript, "🟡"],
    [FileType.TypeScript, "🔵"],
    [FileType.JSX, "🟡"],
    [FileType.TSX, "🔵"],
    [FileType.Rust, "🦀"],
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
    ["rust", FileType.Rust],
    ["Rust", FileType.Rust],
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

// fileExtension tests

describe("fileExtension", () => {
  test.each([
    ["test.md", "md"],
    ["test.py", "py"],
    ["test.js", "js"],
    ["test.ts", "ts"],
    ["test.jsx", "jsx"],
    ["test.tsx", "tsx"],
    ["test.rs", "rs"],
    ["test", null],
  ])(
    "returns correct extension for file: %s",
    (fileName, expectedExtension) => {
      expect(fileExtension(fileName)).toBe(expectedExtension)
    }
  )
})

// fileTypeFromFileName tests

describe("fileTypeFromFileName", () => {
  test.each([
    ["test.md", FileType.Markdown],
    ["test.py", FileType.Python],
    ["test.js", FileType.JavaScript],
    ["test.ts", FileType.TypeScript],
    ["test.jsx", FileType.JSX],
    ["test.tsx", FileType.TSX],
    ["test.rs", FileType.Rust],
    ["test", FileType.Plaintext],
  ])("returns correct FileType for file: %s", (fileName, expectedType) => {
    expect(fileTypeFromFileName(fileName)).toBe(expectedType)
  })
})
