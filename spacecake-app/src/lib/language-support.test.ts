import { describe, expect, it } from "vitest"

import { FileType } from "@/types/workspace"
import {
  fileTypeToCodeMirrorLanguage,
  languageSupport,
  supportedViews,
  supportsRichView,
  supportsSourceView,
} from "@/lib/language-support"

describe("language support", () => {
  describe("python support", () => {
    it("supports rich view", () => {
      expect(supportsRichView(FileType.Python)).toBe(true)
    })

    it("supports source view", () => {
      expect(supportsSourceView(FileType.Python)).toBe(true)
    })

    it("has correct supported views", () => {
      const views = supportedViews(FileType.Python)
      expect(views.has("rich")).toBe(true)
      expect(views.has("source")).toBe(true)
      expect(views.size).toBe(2)
    })
  })

  describe("markdown support", () => {
    it("supports rich view", () => {
      expect(supportsRichView(FileType.Markdown)).toBe(true)
    })

    it("supports source view", () => {
      expect(supportsSourceView(FileType.Markdown)).toBe(true)
    })

    it("has correct supported views", () => {
      const views = supportedViews(FileType.Markdown)
      expect(views.has("rich")).toBe(true)
      expect(views.has("source")).toBe(true)
      expect(views.size).toBe(2)
    })
  })

  describe("javascript support", () => {
    it("does not support rich view", () => {
      expect(supportsRichView(FileType.JavaScript)).toBe(false)
    })

    it("supports source view", () => {
      expect(supportsSourceView(FileType.JavaScript)).toBe(true)
    })

    it("has correct supported views", () => {
      const views = supportedViews(FileType.JavaScript)
      expect(views.has("rich")).toBe(false)
      expect(views.has("source")).toBe(true)
      expect(views.size).toBe(1)
    })
  })

  describe("language support function", () => {
    it("returns correct support for python", () => {
      const support = languageSupport(FileType.Python)
      expect(support.name).toBe("Python")
      expect(support.supportedViews.has("rich")).toBe(true)
      expect(support.supportedViews.has("source")).toBe(true)
    })

    it("returns correct support for markdown", () => {
      const support = languageSupport(FileType.Markdown)
      expect(support.name).toBe("Markdown")
      expect(support.supportedViews.has("rich")).toBe(true)
      expect(support.supportedViews.has("source")).toBe(true)
      expect(support.supportedViews.size).toBe(2)
    })
  })

  describe("fileTypeToCodeMirrorLanguage", () => {
    it("maps python to python", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.Python)).toBe("python")
    })

    it("maps javascript to javascript", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.JavaScript)).toBe(
        "javascript"
      )
    })

    it("maps plaintext to empty string", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.Plaintext)).toBe("")
    })
  })
})
