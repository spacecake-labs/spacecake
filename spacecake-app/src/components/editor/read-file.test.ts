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
  ParagraphNode: vi.fn(),
  TextNode: vi.fn(),
  LexicalNode: vi.fn(),
  Klass: vi.fn(),
  LexicalNodeReplacement: vi.fn(),
}));

vi.mock("@lexical/markdown", () => ({
  $convertFromMarkdownString: vi.fn(),
  TRANSFORMERS: [],
}));

vi.mock("@/components/editor/nodes/code-node", () => ({
  $createCodeBlockNode: vi.fn(() => ({})),
  CodeBlockNode: vi.fn(),
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
      const editorStateFn = getInitialEditorStateFromContent(mockPythonFile);

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
  });

  describe("Markdown files", () => {
    it("should handle Markdown files", async () => {
      const { $convertFromMarkdownString } = await import("@lexical/markdown");

      const editorStateFn = getInitialEditorStateFromContent(mockMarkdownFile);

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
      const mockPlaintextFile: FileContent = {
        name: "test.txt",
        path: "/test/test.txt",
        kind: "file",
        etag: {
          mtimeMs: 1714732800000,
          size: 50,
        },
        content: plainTextContent,
        fileType: FileType.Plaintext,
        cid: ZERO_HASH,
      };

      const editorStateFn = getInitialEditorStateFromContent(mockPlaintextFile);

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($getRoot).toHaveBeenCalled();
      expect($createParagraphNode).toHaveBeenCalled();
      expect($createTextNode).toHaveBeenCalledWith(plainTextContent);
    });

    it("should handle JavaScript files as source view by default", async () => {
      const { $createCodeBlockNode } = await import(
        "@/components/editor/nodes/code-node"
      );

      const content = "console.log('hello world');";
      const mockJavaScriptFile: FileContent = {
        name: "test.js",
        path: "/test/test.js",
        kind: "file",
        etag: {
          mtimeMs: 1714732800000,
          size: 50,
        },
        content: content,
        fileType: FileType.JavaScript,
        cid: ZERO_HASH,
      };

      const editorStateFn =
        getInitialEditorStateFromContent(mockJavaScriptFile);

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($createCodeBlockNode).toHaveBeenCalledWith({
        code: content,
        language: "javascript",
        meta: "source",
        src: mockJavaScriptFile.path,
        block: undefined,
      });
    });
  });

  describe("Source view functionality", () => {
    it("should use source view when explicitly requested", async () => {
      const { $createCodeBlockNode } = await import(
        "@/components/editor/nodes/code-node"
      );

      const editorStateFn = getInitialEditorStateFromContent(
        mockPythonFile,
        "source"
      );

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($createCodeBlockNode).toHaveBeenCalledWith({
        code: mockPythonFile.content,
        language: "python",
        meta: "source",
        src: mockPythonFile.path,
        block: undefined,
      });
    });

    it("should use source view for JavaScript files by default", async () => {
      const { $createCodeBlockNode } = await import(
        "@/components/editor/nodes/code-node"
      );

      const mockJavaScriptFile: FileContent = {
        name: "test.js",
        path: "/test/test.js",
        kind: "file",
        etag: {
          mtimeMs: 1714732800000,
          size: 50,
        },
        content: "console.log('hello');",
        fileType: FileType.JavaScript,
        cid: ZERO_HASH,
      };

      const editorStateFn =
        getInitialEditorStateFromContent(mockJavaScriptFile);

      editorStateFn(mockEditor);

      expect(mockEditor.update).toHaveBeenCalled();
      expect($createCodeBlockNode).toHaveBeenCalledWith({
        code: "console.log('hello');",
        language: "javascript",
        meta: "source",
        src: mockJavaScriptFile.path,
        block: undefined,
      });
    });
  });
});
