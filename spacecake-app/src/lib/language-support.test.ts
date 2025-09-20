import { createStore } from "jotai"
import { beforeEach, describe, expect, it } from "vitest"

import { FileContent, FileType } from "@/types/workspace"
import {
  fileContentAtom,
  userViewPreferencesAtom,
  viewKindAtom,
} from "@/lib/atoms/atoms"
import {
  fileTypeToCodeMirrorLanguage,
  languageSupport,
  supportedViews,
  supportsRichView,
  supportsSourceView,
} from "@/lib/language-support"

const mockFileContent = (
  fileType: FileType,
  path: string,
  content = ""
): FileContent => ({
  path,
  name: path.split("/").pop() || "",
  content,
  fileType,
  kind: "file",
  etag: { mtimeMs: Date.now(), size: content.length },
  cid: "mock_cid",
})

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
      expect(support.fileType).toBe(FileType.Python)
      expect(support.supportedViews.has("rich")).toBe(true)
      expect(support.supportedViews.has("source")).toBe(true)
    })

    it("returns correct support for markdown", () => {
      const support = languageSupport(FileType.Markdown)
      expect(support.fileType).toBe(FileType.Markdown)
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

    it("maps plaintext to null", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.Plaintext)).toBe(null)
    })
  })

  describe("viewKindAtom", () => {
    let store: ReturnType<typeof createStore>
    beforeEach(() => {
      store = createStore()
      store.set(userViewPreferencesAtom, {})
      store.set(fileContentAtom, null)
    })

    it("defaults to rich for python when no user preference", () => {
      store.set(fileContentAtom, mockFileContent(FileType.Python, "/test.py"))
      const viewKind = store.get(viewKindAtom)
      expect(viewKind).toBe("rich")
    })

    it("defaults to source for javascript when no user preference", () => {
      store.set(
        fileContentAtom,
        mockFileContent(FileType.JavaScript, "/test.js")
      )
      const viewKind = store.get(viewKindAtom)
      expect(viewKind).toBe("source")
    })

    it("respects user preferences when set", () => {
      store.set(userViewPreferencesAtom, {
        [FileType.Python]: "source",
      })

      store.set(fileContentAtom, mockFileContent(FileType.Python, "/test.py"))
      expect(store.get(viewKindAtom)).toBe("source")

      store.set(
        fileContentAtom,
        mockFileContent(FileType.JavaScript, "/test.js")
      )
      expect(store.get(viewKindAtom)).toBe("source")
    })
  })
})
