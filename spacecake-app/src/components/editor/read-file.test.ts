import { $getRoot, createEditor, type ElementNode } from "lexical"
import { describe, expect, it } from "vitest"

import type { PyBlock } from "@/types/parser"
import { FileType } from "@/types/workspace"
import type { FileContent } from "@/types/workspace"
import { nodes } from "@/components/editor/nodes"
import { convertPythonBlocksToLexical } from "@/components/editor/read-file"

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
    const file: FileContent = {
      name: "test.py",
      path: "/test.py",
      kind: "file",
      etag: { mtimeMs: Date.now(), size: 50 },
      fileType: FileType.Python,
      cid: "test-cid",
      content: pythonCode,
    }

    expect(file.content === pythonCode, "file should have content")
    expect(file.fileType === FileType.Python, "file should be python type")

    await convertPythonBlocksToLexical(file.content, file, editor)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(2)

      // first child: import statement
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe("import os")

      // second child: function definition
      expect(children[1].getType()).toBe("codeblock")
      expect(children[1].getTextContent()).toBe(
        "def my_function():\n    x = 1\n    y = 2\n    return x + y"
      )
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
    const file: FileContent = {
      name: "test.py",
      path: "/test.py",
      kind: "file",
      etag: { mtimeMs: Date.now(), size: 50 },
      fileType: FileType.Python,
      cid: "test-cid",
      content: pythonCode,
    }

    expect(file.content === pythonCode, "file should have content")
    expect(file.fileType === FileType.Python, "file should be python type")

    await convertPythonBlocksToLexical(file.content, file, editor)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(3)

      // first child: heading with docstring
      expect(children[0].getType()).toBe("heading")
      expect(children[0].getTextContent()).toBe(
        "A file with markdown directives."
      )

      // second child: codeblock
      expect(children[1].getType()).toBe("codeblock")
      expect(children[1].getTextContent()).toBe("import pandas as pd")

      // third child: paragraph with markdown content
      expect(children[2].getType()).toBe("paragraph")
      const paragraphChildren = (children[2] as ElementNode).getChildren()
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
    })
  })
  it("should create an empty code block if the file is empty", async () => {
    const emptyCode = ``
    const editor = createEditor({ nodes })
    const file: FileContent = {
      name: "test.py",
      path: "/test.py",
      kind: "file",
      etag: { mtimeMs: Date.now(), size: 50 },
      fileType: FileType.Python,
      cid: "test-cid",
      content: emptyCode,
    }
    await convertPythonBlocksToLexical(file.content, file, editor)

    console.log(JSON.stringify(editor.getEditorState().toJSON(), null, 2))

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(1)
      expect(children[0].getType()).toBe("codeblock")
      expect(children[0].getTextContent()).toBe("")
    })
  })
  it("should create an empty paragraph if parsing fails", async () => {
    const emptyCode = ""
    const editor = createEditor({ nodes })
    const file: FileContent = {
      name: "test.py",
      path: "/test.py",
      kind: "file",
      etag: { mtimeMs: Date.now(), size: 50 },
      fileType: FileType.Python,
      cid: "test-cid",
      content: emptyCode,
    }

    // create an async generator that throws an error
    const failingParser = async function* (
      content: string
    ): AsyncGenerator<PyBlock> {
      // this will never execute since we pass empty content, but satisfies the linter
      if (content) {
        yield {} as PyBlock
      }
      throw new Error("parsing failed")
    }

    await convertPythonBlocksToLexical(
      file.content,
      file,
      editor,
      failingParser
    )

    console.log(JSON.stringify(editor.getEditorState().toJSON(), null, 2))

    editor.getEditorState().read(() => {
      const root = $getRoot()
      const children = root.getChildren()
      expect(children).toHaveLength(1)
      expect(children[0].getType()).toBe("paragraph")
      expect(children[0].getTextContent()).toBe("")
    })
  })
})
