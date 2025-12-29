import { describe, expect, test } from "vitest"

import { FileType } from "@/types/workspace"
import {
  fileExtension,
  fileTypeFromFileName,
  fileTypeFromLanguage,
} from "@/lib/workspace"

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
    ["go", FileType.Go],
    ["Go", FileType.Go],
    ["c", FileType.C],
    ["C", FileType.C],
    ["cpp", FileType.Cpp],
    ["c++", FileType.Cpp],
    ["C++", FileType.Cpp],
    ["csharp", FileType.CSharp],
    ["c#", FileType.CSharp],
    ["C#", FileType.CSharp],
    ["java", FileType.Java],
    ["Java", FileType.Java],
    ["swift", FileType.Swift],
    ["Swift", FileType.Swift],
    ["kotlin", FileType.Kotlin],
    ["Kotlin", FileType.Kotlin],
    ["json", FileType.JSON],
    ["JSON", FileType.JSON],
    ["yaml", FileType.YAML],
    ["YAML", FileType.YAML],
    ["toml", FileType.TOML],
    ["TOML", FileType.TOML],
  ])("returns correct FileType for language: %s", (language, expectedType) => {
    expect(fileTypeFromLanguage(language)).toBe(expectedType)
  })

  test.each([
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
    ["test.go", "go"],
    ["test.c", "c"],
    ["test.h", "h"],
    ["test.cpp", "cpp"],
    ["test.cc", "cc"],
    ["test.cxx", "cxx"],
    ["test.hpp", "hpp"],
    ["test.cs", "cs"],
    ["test.java", "java"],
    ["test.swift", "swift"],
    ["test.kt", "kt"],
    ["test.kts", "kts"],
    ["test.json", "json"],
    ["test.yaml", "yaml"],
    ["test.yml", "yml"],
    ["test.toml", "toml"],
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
    ["test.go", FileType.Go],
    ["test.c", FileType.C],
    ["test.h", FileType.C],
    ["test.cpp", FileType.Cpp],
    ["test.cc", FileType.Cpp],
    ["test.cxx", FileType.Cpp],
    ["test.hpp", FileType.Cpp],
    ["test.cs", FileType.CSharp],
    ["test.java", FileType.Java],
    ["test.swift", FileType.Swift],
    ["test.kt", FileType.Kotlin],
    ["test.kts", FileType.Kotlin],
    ["test.json", FileType.JSON],
    ["test.yaml", FileType.YAML],
    ["test.yml", FileType.YAML],
    ["test.toml", FileType.TOML],
    ["test", FileType.Plaintext],
  ])("returns correct FileType for file: %s", (fileName, expectedType) => {
    expect(fileTypeFromFileName(fileName)).toBe(expectedType)
  })
})
