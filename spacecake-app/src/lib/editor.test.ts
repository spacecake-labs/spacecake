import { describe, it, expect } from "vitest";
import { getEditorConfig } from "@/lib/editor";
import { FileType, ZERO_HASH } from "@/types/workspace";
import type { FileContent } from "@/types/workspace";
import type { SerializedEditorState } from "lexical";

describe("Editor Integration", () => {
  const mockPythonFile: FileContent = {
    name: "test.py",
    path: "/test/test.py",
    kind: "file",
    etag: {
      mtimeMs: 1714732800000,
      size: 100,
    },
    content: `import math

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b`,
    fileType: FileType.Python,
    cid: ZERO_HASH,
  };

  const mockMarkdownFile: FileContent = {
    name: "test.md",
    path: "/test/test.md",
    kind: "file",
    etag: {
      mtimeMs: 1714732800000,
      size: 50,
    },
    content: "# Hello\n\nThis is markdown",
    fileType: FileType.Markdown,
    cid: ZERO_HASH,
  };

  describe("getEditorConfig", () => {
    it("creates config for Python files", () => {
      const config = getEditorConfig(null, mockPythonFile, "/test/test.py");

      expect(config).not.toBeNull();
      expect(config?.editorState).toBeDefined();
    });

    it("creates config for Markdown files", () => {
      const config = getEditorConfig(null, mockMarkdownFile, "/test/test.md");

      expect(config).not.toBeNull();
      expect(config?.editorState).toBeDefined();
    });

    it("returns null when no file content", () => {
      const config = getEditorConfig(null, null, null);

      expect(config).toBeNull();
    });

    it("prioritizes editor state over file content", () => {
      const mockEditorState: SerializedEditorState = {
        root: {
          type: "root",
          version: 1,
          children: [],
          direction: "ltr",
          format: "left",
          indent: 0,
        },
      };
      const config = getEditorConfig(
        mockEditorState,
        mockPythonFile,
        "/test/test.py"
      );

      expect(config).not.toBeNull();
      expect(config?.editorState).toBe(JSON.stringify(mockEditorState));
    });
  });
});
