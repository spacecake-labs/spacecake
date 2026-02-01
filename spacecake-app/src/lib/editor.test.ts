import type { LexicalEditor } from "lexical"

import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from "lexical"
import { beforeEach, describe, expect, it } from "vitest"

import type { SerializedSelection } from "@/types/lexical"

import { nodes } from "@/components/editor/nodes"
import {
  $createCodeBlockNode,
  $isCodeBlockNode,
  type CodeMirrorSelection,
} from "@/components/editor/nodes/code-node"
import {
  $restoreSelection,
  convertToSourceView,
  getEditorConfig,
  serializeEditorToPython,
  serializeEditorToSource,
} from "@/lib/editor"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { JsonValue } from "@/schema/drizzle-effect"
import { AbsolutePath, EditorFile, FileType } from "@/types/workspace"

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
    cid: "test-cid",
    selection: null,
  }

  const mockMarkdownFile: EditorFile = {
    fileId: FilePrimaryKey("test-markdown-file"),
    editorId: EditorPrimaryKey("test-markdown-file"),
    path: AbsolutePath("/test/test.md"),
    fileType: FileType.Markdown,
    content: "# Hello\n\nThis is markdown",
    cid: "test-cid",
    selection: null,
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

    it("returns function when initialSelection is provided", () => {
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
      const mockSelection: SerializedSelection = {
        anchor: { key: "1", offset: 0 },
        focus: { key: "1", offset: 0 },
      }
      const config = getEditorConfig(mockEditorState, mockPythonFile, "rich", mockSelection)

      expect(config).not.toBeNull()
      expect(typeof config?.editorState).toBe("function")
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

    it("handles empty editor gracefully for JavaScript files", () => {
      const result = serializeEditorToSource(editor.getEditorState(), FileType.JavaScript)
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

      const result = serializeEditorToSource(editor.getEditorState(), FileType.JavaScript)
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
      cid: "test-cid",
      selection: null,
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

  describe("$restoreSelection", () => {
    let editor: LexicalEditor

    beforeEach(() => {
      editor = createEditor({ nodes })
    })

    it("restores selection for text nodes using RangeSelection", async () => {
      // Set up editor with a paragraph containing text
      let textNodeKey: string

      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            const root = $getRoot()
            const paragraph = $createParagraphNode()
            const textNode = $createTextNode("hello world")
            paragraph.append(textNode)
            root.append(paragraph)
            textNodeKey = textNode.getKey()
          },
          { onUpdate: resolve },
        )
      })

      // Restore selection and verify
      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            $restoreSelection({
              anchor: { key: textNodeKey, offset: 0 },
              focus: { key: textNodeKey, offset: 5 },
            })

            const selection = $getSelection()
            expect($isRangeSelection(selection)).toBe(true)
            if ($isRangeSelection(selection)) {
              expect(selection.anchor.offset).toBe(0)
              expect(selection.focus.offset).toBe(5)
            }
          },
          { onUpdate: resolve },
        )
      })
    })

    it("restores selection for CodeBlockNode", async () => {
      let codeBlockKey: string
      let storedSelection: CodeMirrorSelection | null = null

      // Create code block with in-memory focus manager
      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            const root = $getRoot()
            const codeBlock = $createCodeBlockNode({
              code: "const x = 1",
              language: "javascript",
            })
            root.append(codeBlock)
            codeBlockKey = codeBlock.getKey()

            // Provide in-memory focus manager
            codeBlock.setFocusManager({
              focus: () => {},
              restoreSelection: (sel) => {
                storedSelection = sel
              },
              getSelection: () => storedSelection,
            })
          },
          { onUpdate: resolve },
        )
      })

      // Restore selection and verify via getSelection
      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            $restoreSelection({
              anchor: { key: codeBlockKey, offset: 6 }, // "const |x = 1"
              focus: { key: codeBlockKey, offset: 11 }, // "const x = 1|"
            })

            const node = $getNodeByKey(codeBlockKey)
            if ($isCodeBlockNode(node)) {
              const sel = node.getSelection()
              expect(sel?.anchor).toBe(6)
              expect(sel?.head).toBe(11)
            }
          },
          { onUpdate: resolve },
        )
      })
    })

    it("handles missing focus manager gracefully", async () => {
      // Set up code block WITHOUT setting focus manager
      let codeBlockKey: string

      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            const root = $getRoot()
            const codeBlock = $createCodeBlockNode({ code: "test" })
            root.append(codeBlock)
            codeBlockKey = codeBlock.getKey()
          },
          { onUpdate: resolve },
        )
      })

      // Should not throw when focus manager is missing
      await expect(
        new Promise<void>((resolve, reject) => {
          try {
            editor.update(
              () => {
                $restoreSelection({
                  anchor: { key: codeBlockKey, offset: 0 },
                  focus: { key: codeBlockKey, offset: 2 },
                })
              },
              { onUpdate: resolve },
            )
          } catch (e) {
            reject(e)
          }
        }),
      ).resolves.toBeUndefined()
    })

    it("handles null selection gracefully", () => {
      editor.update(() => {
        // Should not throw
        expect(() => $restoreSelection(null)).not.toThrow()
      })
    })

    it("handles missing nodes gracefully", () => {
      editor.update(() => {
        // Should not throw when nodes don't exist
        expect(() =>
          $restoreSelection({
            anchor: { key: "nonexistent", offset: 0 },
            focus: { key: "nonexistent", offset: 0 },
          }),
        ).not.toThrow()
      })
    })
  })
})
