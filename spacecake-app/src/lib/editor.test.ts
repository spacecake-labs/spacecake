import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { JsonValue } from "@/schema/drizzle-effect"
import type { LexicalEditor } from "lexical"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import { AbsolutePath, EditorFile, FileType } from "@/types/workspace"
import {
  convertToSourceView,
  getEditorConfig,
  serializeEditorToPython,
  serializeEditorToSource,
} from "@/lib/editor"
import { nodes } from "@/components/editor/nodes"

describe("Editor Integration", () => {
  const mockPythonFile: EditorFile = {
    fileId: FilePrimaryKey("test-python-file"),
    editorId: EditorPrimaryKey("test-python-file"),
    path: AbsolutePath("/test/test.py"),
    fileType: FileType.Python,
    content: `import math

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b`,
  }

  const mockMarkdownFile: EditorFile = {
    fileId: FilePrimaryKey("test-markdown-file"),
    editorId: EditorPrimaryKey("test-markdown-file"),
    path: AbsolutePath("/test/test.md"),
    fileType: FileType.Markdown,
    content: "# Hello\n\nThis is markdown",
  }

  describe("getEditorConfig", () => {
    it("creates config for Python files", () => {
      const config = getEditorConfig(null, mockPythonFile, "rich")

      expect(config).not.toBeNull()
      expect(config?.editorState).toBeDefined()
    })

    it("creates config for Markdown files", () => {
      const config = getEditorConfig(null, mockMarkdownFile, "rich")

      expect(config).not.toBeNull()
      expect(config?.editorState).toBeDefined()
    })

    it("returns null when no file content", () => {
      const config = getEditorConfig(null, null, "rich")

      expect(config).toBeNull()
    })

    it("prioritizes editor state over file content", () => {
      const mockEditorState: JsonValue = {
        root: {
          type: "root",
          version: 1,
          children: [],
          direction: "ltr",
          format: "left",
          indent: 0,
        },
      }
      const config = getEditorConfig(mockEditorState, mockPythonFile, "rich")

      expect(config).not.toBeNull()
      expect(config?.editorState).toBe(JSON.stringify(mockEditorState))
    })
  })

  describe("serializeEditorToPython", () => {
    let editor: LexicalEditor

    beforeEach(() => {
      editor = createEditor({ nodes })
    })

    it("handles empty editor gracefully", () => {
      const result = serializeEditorToPython(editor.getEditorState())
      expect(result).toBe("")
    })
  })

  describe("serializeEditorToSource", () => {
    let editor: LexicalEditor

    beforeEach(() => {
      editor = createEditor({ nodes })
    })

    it("handles empty editor gracefully", () => {
      const result = serializeEditorToSource(editor.getEditorState())
      expect(result).toBe("")
    })

    it("falls back to concatenated text when no code block found", async () => {
      await new Promise<void>((resolve) => {
        editor.update(() => {
          const root = $getRoot()
          const paragraph = $createParagraphNode()
          const textNode = $createTextNode("some text content")
          paragraph.append(textNode)
          root.append(paragraph)
        })
        editor.registerUpdateListener(() => {
          resolve()
        })
      })

      const result = serializeEditorToSource(editor.getEditorState())
      expect(result).toBe("some text content")
    })
  })

  describe("convertToSourceView", () => {
    let editor: LexicalEditor
    const mockFile: EditorFile = {
      fileId: FilePrimaryKey("test-js-file"),
      editorId: EditorPrimaryKey("test-js-file"),
      path: AbsolutePath("/test/test.js"),
      fileType: FileType.JavaScript,
      content: "console.log('hello');",
    }

    beforeEach(() => {
      editor = createEditor({ nodes })
    })

    it("handles empty content gracefully", async () => {
      await new Promise<void>((resolve) => {
        convertToSourceView("", mockFile, editor)
        editor.registerUpdateListener(() => {
          resolve()
        })
      })

      editor.getEditorState().read(() => {
        const root = $getRoot()
        const children = root.getChildren()
        expect(children).toHaveLength(1)
        expect(children[0].getType()).toBe("codeblock")
      })
    })

    it("clears existing content before adding new code block", async () => {
      // First add some content
      await new Promise<void>((resolve) => {
        editor.update(() => {
          const root = $getRoot()
          const paragraph = $createParagraphNode()
          const textNode = $createTextNode("old content")
          paragraph.append(textNode)
          root.append(paragraph)
        })
        editor.registerUpdateListener(() => {
          resolve()
        })
      })

      // Then convert to source view
      const content = "new code content"
      await new Promise<void>((resolve) => {
        convertToSourceView(content, mockFile, editor)
        editor.registerUpdateListener(() => {
          resolve()
        })
      })

      editor.getEditorState().read(() => {
        const root = $getRoot()
        const children = root.getChildren()
        expect(children).toHaveLength(1)
        expect(children[0].getType()).toBe("codeblock")
      })
    })
  })
})
