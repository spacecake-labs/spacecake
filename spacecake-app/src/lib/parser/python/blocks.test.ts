import type Parser from "tree-sitter"

import { readFileSync } from "fs"
import { join } from "path"
import { beforeEach, describe, expect, it } from "vitest"

import { createParser } from "@/lib/parser/languages"
import {
  blockKind,
  blockName,
  isDataclass,
  isDocstring,
  isMdocString,
  parseCodeBlocks,
  parsePythonContent,
} from "@/lib/parser/python/blocks"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { normalizeLineEndings } from "@/test-utils/platform"
import { AbsolutePath, EditorFile, FileType } from "@/types/workspace"

describe("Python parser", () => {
  let parser: Parser

  beforeEach(() => {
    parser = createParser()
  })

  it("isDataclass should detect dataclass", () => {
    const code = `@dataclass
class Person:
    name: str
    age: int`
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    // get the first child of the module (which should be the decorated_definition)
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")

    expect(isDataclass(node)).toBe(true)
  })

  it("isDataclass should not detect undecorated class", () => {
    const code = `class Person:
    name: str
    age: int`
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    // get the first child of the module (which should be the decorated_definition)
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")

    expect(isDataclass(node)).toBe(false)
  })

  it.each([
    {
      description: "should detect triple double quote docstring",
      code: `"""docstring"""`,
      expected: true,
    },
    {
      description: "should detect triple single quote docstring",
      code: `'''docstring'''`,
      expected: true,
    },
    {
      description: "should detect raw triple double quote docstring",
      code: `r"""docstring"""`,
      expected: true,
    },
    {
      description: "should detect raw triple single quote docstring",
      code: `r'''docstring'''`,
      expected: true,
    },
    {
      description: "should not detect regular double quote string",
      code: `"docstring"`,
      expected: false,
    },
    {
      description: "should not detect regular single quote string",
      code: `'docstring'`,
      expected: false,
    },
  ])("isDocstring $description", ({ code, expected }) => {
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")
    expect(isDocstring(node)).toBe(expected)
  })

  it.each([
    {
      description: "should detect mdocstring with space",
      code: `#🍰 mdocstring`,
      expected: true,
    },
    {
      description: "should detect mdocstring without space",
      code: `#🍰mdocstring`,
      expected: true,
    },
  ])("isMdocString $description", ({ code, expected }) => {
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")
    expect(isMdocString(node)).toBe(expected)
  })

  it.each([
    {
      description: "should detect a class",
      code: `class Person:
    pass`,
      expected: "class",
    },
    {
      description: "should detect a dataclass",
      code: `@dataclass
class Person:
    name: str
    age: int`,
      expected: "dataclass",
    },
    {
      description: "should detect a function",
      code: `def f():
    pass`,
      expected: "function",
    },
    {
      description: "should detect an import statement",
      code: `import math`,
      expected: "import",
    },
    {
      description: "should detect an import from statement",
      code: `from math import sin`,
      expected: "import",
    },
    {
      description: "should detect regular comment",
      code: `# comment`,
      expected: null,
    },

    {
      description: "should detect mdocstring with space",
      code: `#🍰 mdocstring`,
      expected: "markdown block",
    },
    {
      description: "should detect mdocstring without space",
      code: `#🍰mdocstring`,
      expected: "markdown block",
    },
  ])("blockKind $description", ({ code, expected }) => {
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")
    expect(blockKind(node)).toBe(expected)
  })

  it.each([
    {
      description: "should detect a class name",
      code: `class Person:
        pass`,
      expected: { kind: "named", value: "Person" },
    },
    {
      description: "should detect a function name",
      code: `def f():
        pass`,
      expected: { kind: "named", value: "f" },
    },
    {
      description: "should name import as anonymous",
      code: `import math`,
      expected: { kind: "anonymous", value: "anonymous" },
    },
    {
      description: "should detect an import from name",
      code: `from math import sin`,
      expected: { kind: "anonymous", value: "anonymous" },
    },
    {
      description: "should detect `decorated` name",
      code: `@property
def f():
    pass`,
      expected: { kind: "named", value: "f" },
    },
    {
      description: "should detect dataclass name",
      code: `@dataclass
class Person:
    name: str
    age: int`,
      expected: { kind: "named", value: "Person" },
    },
  ])("blockName $description", ({ code, expected }) => {
    const tree = parser.parse(code)
    if (!tree) throw new Error("failed to parse code")
    const node = tree.rootNode.firstChild
    if (!node) throw new Error("failed to get first child of module")
    expect(blockName(node)).toStrictEqual(expected)
  })
  describe("parseCodeBlocks", () => {
    it("should parse blocks from core.py", () => {
      // Normalize line endings for cross-platform compatibility (git on Windows may convert LF to CRLF)
      const code = normalizeLineEndings(
        readFileSync(join(__dirname, "../../../../tests/fixtures/core.py"), "utf-8"),
      )

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(7) // doc, import, dataclass, function, class, misc, main

      expect(blocks[0].kind).toBe("module")
      expect(blocks[0].doc?.text).toBe('"""A file to test block parsing."""')
      expect(blocks[0].doc?.startLine).toBe(1)

      // import block
      expect(blocks[1].kind).toBe("import")
      expect(blocks[1].text).toBe(
        "\n\nimport math\nimport pandas as pd\n\nfrom dataclasses import dataclass\nfrom datetime import datetime",
      )
      expect(blocks[1].startLine).toBe(3)

      expect(blocks[2].kind).toBe("dataclass")
      expect(blocks[2].text).toBe("\n\n\n@dataclass\nclass Person:\n    name: str\n    age: int")
      expect(blocks[2].startLine).toBe(10)

      expect(blocks[3].kind).toBe("function")
      expect(blocks[3].text).toBe(
        "\n\n\n# fibonacci function\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n - 1) + fibonacci(n - 2)",
      )
      expect(blocks[3].startLine).toBe(16)

      expect(blocks[4].kind).toBe("class")
      expect(blocks[4].text).toBe(
        "\n\n\nclass Calculator:\n    def add(self, a, b):\n        return a + b",
      )
      expect(blocks[4].startLine).toBe(23)

      // Misc block between class and main
      expect(blocks[5].kind).toBe("misc")
      expect(blocks[5].name.kind).toBe("anonymous")
      expect(blocks[5].text).toBe(`\n\n\nmisc_var = True\nprint(f"here's a misc var: {misc_var}")`)
      expect(blocks[5].startLine).toBe(28)

      expect(blocks[6].kind).toBe("main")
      expect(blocks[6].text).toBe(
        `\n\nif __name__ == "__main__":\n    text = input("echo: ")\n    print(text)`,
      )
      expect(blocks[6].startLine).toBe(31)
    })

    it("parses module description in import block", () => {
      const code = `r"""module header"""\nimport os\nimport sys\n\n\ndef f():\n    pass\n`

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(3)
      expect(blocks[0].kind).toBe("module")
      expect(blocks[0].doc?.text).toBe('r"""module header"""')
      expect(blocks[0].doc?.startLine).toBe(1)
      expect(blocks[1].kind).toBe("import")
      expect(blocks[1].text).toBe("\nimport os\nimport sys")
      expect(blocks[1].startLine).toBe(2)
      expect(blocks[2].kind).toBe("function")
      expect(blocks[2].text).toBe("\n\n\ndef f():\n    pass\n")
      expect(blocks[2].startLine).toBe(6)
    })

    it("yields misc block between import and function", () => {
      const code = "import os\n\n" + "x = 1\n\n" + "def f():\n    pass\n"

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(3)
      expect(blocks[0].kind).toBe("import")
      expect(blocks[0].startLine).toBe(1)
      expect(blocks[1].kind).toBe("misc")
      expect(blocks[1].text).toBe("\n\nx = 1")
      expect(blocks[1].startLine).toBe(3)
      expect(blocks[2].kind).toBe("function")
      expect(blocks[2].startLine).toBe(5)
    })

    it("yields import block at EOF", () => {
      const code = "from dataclasses import dataclass"

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(1)
      expect(blocks[0].kind).toBe("import")
      expect(blocks[0].text).toBe("from dataclasses import dataclass")
      expect(blocks[0].startLine).toBe(1)
    })

    it("yields misc block at EOF", () => {
      const code = "def f():\n    return 1\n\n" + "x = 2\n"

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(2)
      expect(blocks[0].kind).toBe("function")
      expect(blocks[1].kind).toBe("misc")
      expect(blocks[1].text).toBe("\n\nx = 2\n")
      expect(blocks[0].startLine).toBe(1)
      expect(blocks[1].startLine).toBe(4)
    })

    it("yields module docstring", () => {
      const code = '"""A docstring"""'

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(1)
      expect(blocks[0].kind).toBe("module")
      expect(blocks[0].doc?.text).toBe('"""A docstring"""')
      expect(blocks[0].doc?.startLine).toBe(1)
    })

    it("accumulates comments in import block", () => {
      const code = "# a comment\nimport os"

      const blocks = parseCodeBlocks(code, "test.py")

      expect(blocks.length).toBe(1)
      expect(blocks[0].kind).toBe("import")
      expect(blocks[0].text).toBe("# a comment\nimport os")
      expect(blocks[0].startLine).toBe(1)
    })
  })

  it("accumulates comments in misc block", () => {
    const code = `# a comment\nprint("hello")`

    const blocks = parseCodeBlocks(code)

    expect(blocks.length).toBe(1)
    expect(blocks[0].kind).toBe("misc")
    expect(blocks[0].text).toBe(`# a comment\nprint("hello")`)
    expect(blocks[0].startLine).toBe(1)
  })

  it("accumulates comments in function block", () => {
    const code = `# a comment\ndef f():\n    pass`

    const blocks = parseCodeBlocks(code)

    expect(blocks.length).toBe(1)
    expect(blocks[0].kind).toBe("function")
    expect(blocks[0].text).toBe(`# a comment\ndef f():\n    pass`)
    expect(blocks[0].startLine).toBe(1)
  })

  it("accumulates consecutive mdocstring comments into single block", () => {
    const code = `"""A file with markdown directives."""

import pandas as pd

#🍰 # a header
#🍰 ## a subheader
#🍰 a paragraph`

    const blocks = parseCodeBlocks(code)

    expect(blocks.length).toBe(3)

    // doc block
    expect(blocks[0].kind).toBe("module")
    expect(blocks[0].doc?.text).toBe('"""A file with markdown directives."""')
    expect(blocks[0].doc?.startLine).toBe(1)

    // import block
    expect(blocks[1].kind).toBe("import")
    expect(blocks[1].text).toBe("\n\nimport pandas as pd")
    expect(blocks[1].startLine).toBe(3)

    // markdown block - all consecutive mdocstring comments should be in one block
    expect(blocks[2].kind).toBe("markdown block")
    expect(blocks[2].text).toBe("\n\n#🍰 # a header\n#🍰 ## a subheader\n#🍰 a paragraph")
    expect(blocks[2].startLine).toBe(5)
  })

  it("parses function with docstring", () => {
    const code = `def f():
    """A docstring."""
    pass`

    const blocks = parseCodeBlocks(code)

    expect(blocks.length).toBe(1)
    expect(blocks[0].kind).toBe("function")
    expect(blocks[0].name.value).toBe("f")
    expect(blocks[0].doc).toBeDefined()
    expect(blocks[0].doc?.text).toBe('"""A docstring."""')
    expect(blocks[0].doc?.startLine).toBe(2)
  })

  it("parses class with docstring", () => {
    const code = `class MyClass:
    """This is a class docstring."""

    def method(self):
        return "hello"`

    const blocks = parseCodeBlocks(code)

    expect(blocks.length).toBe(1)
    expect(blocks[0].kind).toBe("class")
    expect(blocks[0].name.value).toBe("MyClass")
    expect(blocks[0].doc).toBeDefined()
    expect(blocks[0].doc?.text).toBe('"""This is a class docstring."""')
    expect(blocks[0].doc?.startLine).toBe(2)
  })

  describe("fallback block naming", () => {
    it("uses anonymous name when no blocks are parsed", () => {
      const content = "# just comments or empty file\n"
      const file: EditorFile = {
        fileId: FilePrimaryKey("test-file-1"),
        editorId: EditorPrimaryKey("test-file-1"),
        path: AbsolutePath("/test.py"),
        fileType: FileType.Python,
        content: content,
        cid: "test-cid",
        selection: null,
      }
      const blocks = parsePythonContent(file)

      // with the new approach, the parser will still yield a single 'module' fallback
      expect(blocks.length).toBe(1)
      expect(blocks[0].kind).toBe("module")
      expect(blocks[0].name.kind).toBe("named")
      expect(blocks[0].name.value).toBe("test.py")
      expect(blocks[0].text).toBe(content)
      expect(blocks[0].startLine).toBe(1)
    })
  })
})
