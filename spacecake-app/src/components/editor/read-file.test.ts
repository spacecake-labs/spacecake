import { describe, it, expect, vi } from "vitest";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType } from "@/types/workspace";
import type { File } from "@/types/workspace";

// Mock the Python IPC parser
vi.mock("@/lib/parser/python-ipc", () => ({
  parsePythonContentStreaming: vi.fn().mockImplementation(async function* () {
    yield {
      kind: "import",
      startByte: 0,
      endByte: 10,
      text: "import math",
    };
    yield {
      kind: "function",
      startByte: 12,
      endByte: 50,
      text: "def hello():\n    print('Hello')",
    };
  }),
}));

describe("read-file", () => {
  const mockPythonFile: File = {
    name: "test.py",
    path: "/test/test.py",
    type: "file",
    size: 100,
    modified: "2024-01-01",
    isDirectory: false,
    content: `import math

def hello():
    print('Hello')`,
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

  const mockPlaintextFile: File = {
    name: "test.txt",
    path: "/test/test.txt",
    type: "file",
    size: 30,
    modified: "2024-01-01",
    isDirectory: false,
    content: "This is plain text",
    fileType: FileType.Plaintext,
  };

  describe("getInitialEditorStateFromContent", () => {
    it("handles Python files", () => {
      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile.content,
        mockPythonFile.fileType,
        mockPythonFile
      );

      expect(editorStateFn).toBeInstanceOf(Function);
    });

    it("handles Markdown files", () => {
      const editorStateFn = getInitialEditorStateFromContent(
        mockMarkdownFile.content,
        mockMarkdownFile.fileType
      );

      expect(editorStateFn).toBeInstanceOf(Function);
    });

    it("handles Plaintext files", () => {
      const editorStateFn = getInitialEditorStateFromContent(
        mockPlaintextFile.content,
        mockPlaintextFile.fileType
      );

      expect(editorStateFn).toBeInstanceOf(Function);
    });

    it("handles Python files without file object (fallback)", () => {
      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile.content,
        mockPythonFile.fileType
      );

      expect(editorStateFn).toBeInstanceOf(Function);
    });
  });
});
