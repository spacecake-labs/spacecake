import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { $getRoot, createEditor, type ElementNode } from "lexical"
import { describe, expect, it } from "vitest"

import type { PyBlock } from "@/types/parser"
import { AbsolutePath, EditorFile, FileType } from "@/types/workspace"
import { nodes } from "@/components/editor/nodes"
import {
  convertPythonBlocksToLexical,
  getInitialEditorStateFromContent,
} from "@/components/editor/read-file"

describe("read-file: convertPythonBlocksToLexical", () => {
  it("should convert python code to lexical nodes", async () => {
    const pythonCode = `import os

def my_function():
    x = 1
    y = 2
    return x + y
    `

    // create editor
    const editor = createEditor({ nodes })
    const file: EditorFile = {
      fileId: FilePrimaryKey(""),
      editorId: EditorPrimaryKey(""),
      path: AbsolutePath("/test.py"),
      fileType: FileType.Python,
      content: pythonCode,
    }

    expect(file.content === pythonCode, "file should have content")
    expect(file.fileType === FileType.Python, "file should be python type")

    await convertPythonBlocksToLexical(file, editor)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(4)

      // first child: import statement
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe("import os")

      // second child: empty paragraph
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")

      // third child: function definition
      expect(children[2].getType()).toBe("codeblock")
      expect(children[2].getTextContent()).toBe(
        "def my_function():\n    x = 1\n    y = 2\n    return x + y"
      )

      // fourth child: empty paragraph
      expect(children[3].getType()).toBe("paragraph")
      expect(children[3].getTextContent()).toBe("")
    })
  })
  it("should convert python code to lexical nodes with markdown", async () => {
    const pythonCode = `"""A file with markdown directives."""

import pandas as pd

#🍰 # a header
#🍰 ## a subheader
#🍰 a paragraph
    `

    // create editor
    const editor = createEditor({ nodes })
    const file: EditorFile = {
      fileId: FilePrimaryKey(""),
      editorId: EditorPrimaryKey(""),
      path: AbsolutePath("/test.py"),
      fileType: FileType.Python,
      content: pythonCode,
    }

    expect(file.content === pythonCode, "file should have content")
    expect(file.fileType === FileType.Python, "file should be python type")

    await convertPythonBlocksToLexical(file, editor)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(6)

      // first child: heading with docstring
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe(
        '"""A file with markdown directives."""'
      )

      // second child: empty paragraph
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")

      // third child: codeblock
      expect(children[2].getType()).toBe("codeblock")
      expect(children[2].getTextContent()).toBe("import pandas as pd")

      // fourth child: empty paragraph
      expect(children[3].getType()).toBe("paragraph")
      expect(children[3].getTextContent()).toBe("")

      // fifth child: paragraph with markdown content
      expect(children[4].getType()).toBe("container")
      const paragraphChildren = (children[4] as ElementNode).getChildren()
      expect(paragraphChildren).toHaveLength(3)

      // first sub-child: h1 heading
      expect(paragraphChildren[0].getType()).toBe("heading")
      expect(paragraphChildren[0].getTextContent()).toBe("a header")

      // second sub-child: h2 heading
      expect(paragraphChildren[1].getType()).toBe("heading")
      expect(paragraphChildren[1].getTextContent()).toBe("a subheader")

      // third sub-child: paragraph
      expect(paragraphChildren[2].getType()).toBe("paragraph")
      expect(paragraphChildren[2].getTextContent()).toBe("a paragraph")

      // sixth child: empty paragraph
      expect(children[5].getType()).toBe("paragraph")
      expect(children[5].getTextContent()).toBe("")
    })
  })
  it("should create an empty code block if the file is empty", async () => {
    const emptyCode = ``
    const editor = createEditor({ nodes })
    const file: EditorFile = {
      fileId: FilePrimaryKey(""),
      editorId: EditorPrimaryKey(""),
      path: AbsolutePath("/test.py"),
      fileType: FileType.Python,
      content: emptyCode,
    }
    await convertPythonBlocksToLexical(file, editor)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(2)
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe("")
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")
    })
  })
  it("should create an empty paragraph if parsing fails", async () => {
    const emptyCode = ""
    const editor = createEditor({ nodes })
    const file: EditorFile = {
      fileId: FilePrimaryKey(""),
      editorId: EditorPrimaryKey(""),
      path: AbsolutePath("/test.py"),
      fileType: FileType.Python,
      content: emptyCode,
    }

    // create an async generator that throws an error
    const failingParser = async function* (
      file: EditorFile
    ): AsyncGenerator<PyBlock> {
      // this will never execute since we pass empty content, but satisfies the linter
      if (file.content) {
        yield {} as PyBlock
      }
      throw new Error("parsing failed")
    }

    await convertPythonBlocksToLexical(file, editor, failingParser)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(1)
      expect(children[0].getType()).toBe("paragraph")
      expect(children[0].getTextContent()).toBe("")
    })
  })
})

describe("read-file: getInitialEditorStateFromContent", () => {
  it("should load python file in rich view by default", async () => {
    const pythonCode = `import os

def my_function():
    x = 1
    y = 2
    return x + y
    `

    const file: EditorFile = {
      fileId: FilePrimaryKey(""),
      editorId: EditorPrimaryKey(""),
      path: AbsolutePath("/test.py"),
      fileType: FileType.Python,
      content: pythonCode,
    }

    // Create editor and then apply the initial state
    const editor = createEditor({ nodes })

    // Create a promise that resolves when the async operation completes
    const completionPromise = new Promise<void>((resolve) => {
      const updateFunction = getInitialEditorStateFromContent(
        file,
        "rich",
        resolve
      )

      // Apply the update using the existing logic
      updateFunction(editor)
    })

    // Wait for the completion callback to be called
    await completionPromise

    // Now check the editor state after initialization
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(4)

      // first child: import statement
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe("import os")

      // second child: empty paragraph
      expect(children[1].getType()).toBe("paragraph")
      expect(children[1].getTextContent()).toBe("")

      // third child: function definition
      expect(children[2].getType()).toBe("codeblock")
      expect(children[2].getTextContent()).toBe(
        "def my_function():\n    x = 1\n    y = 2\n    return x + y"
      )

      // fourth child: empty paragraph
      expect(children[3].getType()).toBe("paragraph")
      expect(children[3].getTextContent()).toBe("")
    })
  })
})
