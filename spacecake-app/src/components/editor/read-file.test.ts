import { describe, it, expect, vi, beforeEach } from "vitest";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { FileType, ZERO_HASH } from "@/types/workspace";
import type { FileContent } from "@/types/workspace";
import type { LexicalEditor } from "lexical";
import { anonymousName } from "@/types/parser";

// Mock the Python parser
vi.mock("@/lib/parser/python/blocks", () => ({
  parsePythonContentStreaming: vi.fn().mockImplementation(async function* () {
    yield {
      kind: "import",
      name: anonymousName(),
      startByte: 0,
      endByte: 11,
      text: "import math",
      startLine: 1,
    };
    yield {
      kind: "function",
      name: "fibonacci",
      startByte: 13,
      endByte: 85,
      text: "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
      startLine: 2,
    };
  }),
}));

// Mock Lexical components
vi.mock("lexical", () => ({
  $getRoot: vi.fn(() => ({ clear: vi.fn(), append: vi.fn() })),
  $createParagraphNode: vi.fn(() => ({ append: vi.fn() })),
  $createTextNode: vi.fn(() => ({})),
}));

vi.mock("@lexical/markdown", () => ({
  $convertFromMarkdownString: vi.fn(),
  TRANSFORMERS: [],
}));

vi.mock("@/components/editor/nodes/code-node", () => ({
  $createCodeBlockNode: vi.fn(() => ({})),
}));

vi.mock("@/components/editor/nodes/delimited", () => ({
  $createDelimitedNode: vi.fn(() => ({})),
  DelimitedNode: vi.fn(),
}));

describe("getInitialEditorStateFromContent", () => {
  let mockEditor: LexicalEditor;

  beforeEach(() => {
    mockEditor = {
      update: vi.fn((fn) => fn()),
    } as unknown as LexicalEditor;
    vi.clearAllMocks();
  });

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
    return fibonacci(n-1) + fibonacci(n-2)`,
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

  describe("Python files", () => {
    it("should handle Python files with progressive rendering", async () => {
      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile.content,
        FileType.Python,
        mockPythonFile
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();

      // Give time for async parsing to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The Python parser mock should have been called
      const { parsePythonContentStreaming } = await import(
        "@/lib/parser/python/blocks"
      );
      expect(parsePythonContentStreaming).toHaveBeenCalledWith(
        mockPythonFile.content
      );
    });

    it("should handle Python files without file object (fallback to plaintext)", async () => {
      const { $getRoot, $createParagraphNode, $createTextNode } = await import(
        "lexical"
      );

      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile.content,
        FileType.Python
        // No file object provided
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($getRoot).toHaveBeenCalled();
      expect($createParagraphNode).toHaveBeenCalled();
      expect($createTextNode).toHaveBeenCalledWith(mockPythonFile.content);
    });
  });

  describe("Markdown files", () => {
    it("should handle Markdown files", async () => {
      const { $convertFromMarkdownString } = await import("@lexical/markdown");

      const editorStateFn = getInitialEditorStateFromContent(
        mockMarkdownFile.content,
        FileType.Markdown,
        mockMarkdownFile
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($convertFromMarkdownString).toHaveBeenCalledWith(
        mockMarkdownFile.content,
        []
      );
    });
  });

  describe("Plaintext files", () => {
    it("should handle plaintext files", async () => {
      const { $getRoot, $createParagraphNode, $createTextNode } = await import(
        "lexical"
      );

      const plainTextContent = "This is plain text";
      const editorStateFn = getInitialEditorStateFromContent(
        plainTextContent,
        FileType.Plaintext
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($getRoot).toHaveBeenCalled();
      expect($createParagraphNode).toHaveBeenCalled();
      expect($createTextNode).toHaveBeenCalledWith(plainTextContent);
    });

    it("should handle unknown file types as plaintext", async () => {
      const { $getRoot, $createParagraphNode, $createTextNode } = await import(
        "lexical"
      );

      const content = "Some content";
      const editorStateFn = getInitialEditorStateFromContent(
        content,
        "unknown" as FileType
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($getRoot).toHaveBeenCalled();
      expect($createParagraphNode).toHaveBeenCalled();
      expect($createTextNode).toHaveBeenCalledWith(content);
    });
  });

  describe("Error handling", () => {
    it("should fallback to plaintext when Python parsing fails", async () => {
      // Mock the Python parser to throw an error
      const { parsePythonContentStreaming } = await import(
        "@/lib/parser/python/blocks"
      );
      vi.mocked(parsePythonContentStreaming).mockImplementation(
        async function* () {
          // Yield a dummy PyBlock before throwing error
          yield {
            kind: "import",
            name: anonymousName(),
            startByte: 0,
            endByte: 5,
            text: "dummy",
            startLine: 1,
          };
          throw new Error("Parsing failed");
        }
      );

      const { $createTextNode } = await import("lexical");

      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile.content,
        FileType.Python,
        mockPythonFile
      );

      editorStateFn(mockEditor);

      // Give time for async parsing to fail and fallback
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should eventually fall back to plaintext
      expect($createTextNode).toHaveBeenCalledWith(mockPythonFile.content);
    });
  });
});
