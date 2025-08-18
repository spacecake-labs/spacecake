import { describe, it, expect, beforeEach } from "vitest";
import { FileType } from "@/types/workspace";
import {
  languageSupport,
  supportsBlockView,
  supportsSourceView,
  supportedViews,
  fileTypeToCodeMirrorLanguage,
} from "@/lib/language-support";
import { userViewPreferencesAtom, viewKindAtom } from "@/lib/atoms/atoms";
import { createStore } from "jotai";

describe("language support", () => {
  describe("python support", () => {
    it("supports block view", () => {
      expect(supportsBlockView(FileType.Python)).toBe(true);
    });

    it("supports source view", () => {
      expect(supportsSourceView(FileType.Python)).toBe(true);
    });

    it("has correct supported views", () => {
      const views = supportedViews(FileType.Python);
      expect(views.has("block")).toBe(true);
      expect(views.has("source")).toBe(true);
      expect(views.size).toBe(2);
    });
  });

  describe("markdown support", () => {
    it("supports block view", () => {
      expect(supportsBlockView(FileType.Markdown)).toBe(true);
    });

    it("supports source view", () => {
      expect(supportsSourceView(FileType.Markdown)).toBe(true);
    });

    it("has correct supported views", () => {
      const views = supportedViews(FileType.Markdown);
      expect(views.has("block")).toBe(true);
      expect(views.has("source")).toBe(true);
      expect(views.size).toBe(2);
    });
  });

  describe("javascript support", () => {
    it("does not support block view", () => {
      expect(supportsBlockView(FileType.JavaScript)).toBe(false);
    });

    it("supports source view", () => {
      expect(supportsSourceView(FileType.JavaScript)).toBe(true);
    });

    it("has correct supported views", () => {
      const views = supportedViews(FileType.JavaScript);
      expect(views.has("block")).toBe(false);
      expect(views.has("source")).toBe(true);
      expect(views.size).toBe(1);
    });
  });

  describe("language support function", () => {
    it("returns correct support for python", () => {
      const support = languageSupport(FileType.Python);
      expect(support.fileType).toBe(FileType.Python);
      expect(support.supportedViews.has("block")).toBe(true);
      expect(support.supportedViews.has("source")).toBe(true);
    });

    it("returns correct support for markdown", () => {
      const support = languageSupport(FileType.Markdown);
      expect(support.fileType).toBe(FileType.Markdown);
      expect(support.supportedViews.has("block")).toBe(true);
      expect(support.supportedViews.has("source")).toBe(true);
      expect(support.supportedViews.size).toBe(2);
    });
  });

  describe("fileTypeToCodeMirrorLanguage", () => {
    it("maps python to python", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.Python)).toBe("python");
    });

    it("maps javascript to javascript", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.JavaScript)).toBe(
        "javascript"
      );
    });

    it("maps plaintext to null", () => {
      expect(fileTypeToCodeMirrorLanguage(FileType.Plaintext)).toBe(null);
    });
  });

  describe("viewKindAtom", () => {
    const store = createStore();
    beforeEach(() => {
      store.set(userViewPreferencesAtom, {});
    });

    it("defaults to block for python when no user preference", () => {
      const getViewKind = store.get(viewKindAtom);
      const viewKind = getViewKind(FileType.Python);
      expect(viewKind).toBe("block");
    });

    it("defaults to source for javascript when no user preference", () => {
      const getViewKind = store.get(viewKindAtom);
      const viewKind = getViewKind(FileType.JavaScript);
      expect(viewKind).toBe("source");
    });

    it("respects user preferences when set", () => {
      store.set(userViewPreferencesAtom, {
        [FileType.Python]: "source",
      });

      const getViewKind = store.get(viewKindAtom);
      expect(getViewKind(FileType.Python)).toBe("source");
      expect(getViewKind(FileType.JavaScript)).toBe("source");
    });
  });
});
