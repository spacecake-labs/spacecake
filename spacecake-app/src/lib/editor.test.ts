import { describe, it, expect } from "vitest";
import { getEditorConfig } from "@/lib/editor";
import { FileType } from "@/types/workspace";
import type { File } from "@/types/workspace";
import type { SerializedEditorState } from "lexical";

describe("Editor Integration", () => {
  const mockPythonFile: File = {
    name: "test.py",
    path: "/test/test.py",
    type: "file",
    size: 100,
    modified: "2024-01-01",
    isDirectory: false,
    content: `import math

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b`,
    fileType: FileType.Python,
  };

  const mockMarkdownFile: File = {
    name: "test.md",
    path: "/test/test.md",
    type: "file",
    size: 50,
    modified: "2024-01-01",
    isDirectory: false,
    content: "# Hello\n\nThis is markdown",
    fileType: FileType.Markdown,
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
