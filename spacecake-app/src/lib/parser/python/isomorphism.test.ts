import { readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

import type { PyBlock } from "@/types/parser"
import { AbsolutePath, FileType } from "@/types/workspace"
import type { FileContent } from "@/types/workspace"
import {
  parseCodeBlocks,
  parsePythonContentStreaming,
  serializeBlocksToPython,
} from "@/lib/parser/python/blocks"

describe("Python parser isomorphism", () => {
  it("tests that parse/serialize is isomorphic for core.py", async () => {
    const code = readFileSync(
      join(__dirname, "../../../../tests/fixtures/core.py"),
      "utf-8"
    )

    // First parse
    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    // Serialize back to Python
    const serializedCode = serializeBlocksToPython(originalBlocks)

    // Parse the serialized code
    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    // Verify isomorphism
    expect(reparsedBlocks.length).toBe(originalBlocks.length)

    for (let i = 0; i < originalBlocks.length; i++) {
      const original = originalBlocks[i]
      const reparsed = reparsedBlocks[i]

      expect(reparsed.kind).toBe(original.kind)
      expect(reparsed.name.value).toBe(original.name.value)
      expect(reparsed.startLine).toBe(original.startLine)
      expect(reparsed.text).toBe(original.text)
      expect(reparsed.cid).toBe(original.cid)
    }

    // The final serialized code should be identical to the original
    expect(serializedCode).toBe(code)
  })

  it("tests that parse/serialize is isomorphic for simple python code", async () => {
    const code = `"""docstring"""\nimport os\ndef f():\n    pass\n`

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)

    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    expect(reparsedBlocks.length).toBe(originalBlocks.length)
    expect(reparsedBlocks[0].text).toBe(originalBlocks[0].text)
    expect(reparsedBlocks[1].text).toBe(originalBlocks[1].text)
    expect(reparsedBlocks[2].text).toBe(originalBlocks[2].text)
  })

  it("tests that parse/serialize is isomorphic for code with comments and whitespace", async () => {
    const code = `# header comment\n"""docstring"""\n\nimport os\n\n# function comment\ndef f():\n    pass\n`

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)

    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    expect(reparsedBlocks.length).toBe(originalBlocks.length)
    for (let i = 0; i < originalBlocks.length; i++) {
      expect(reparsedBlocks[i].text).toBe(originalBlocks[i].text)
    }
  })

  it("tests that parse/serialize is isomorphic for empty file", async () => {
    const code = ""

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)
  })

  it("tests that parse/serialize is isomorphic for file with only comments", async () => {
    const code = "# just a comment\n# another comment\n"

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    // Files with only comments don't produce blocks, so we get empty array
    expect(originalBlocks.length).toBe(0)

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe("")

    // Test that the streaming parser handles this case with fallback
    const file: FileContent = {
      name: "test.py",
      path: AbsolutePath("/test.py"),
      kind: "file",
      etag: { mtimeMs: Date.now(), size: code.length },
      fileType: FileType.Python,
      cid: "test-cid",
      content: code,
    }
    const streamingBlocks: PyBlock[] = []
    for await (const block of parsePythonContentStreaming(file)) {
      streamingBlocks.push(block)
    }

    // Streaming parser should create a fallback 'module' block
    expect(streamingBlocks.length).toBe(1)
    expect(streamingBlocks[0].kind).toBe("module")
    expect(streamingBlocks[0].text).toBe(code)

    const streamingSerialized = serializeBlocksToPython(streamingBlocks)
    expect(streamingSerialized).toBe(code)
  })

  it("tests that parse/serialize is isomorphic for complex nested structures", async () => {
    const code = `"""Module docstring"""

import os
import sys

class OuterClass:
    """Class docstring"""
    
    def __init__(self):
        self.value = 42
    
    class InnerClass:
        def inner_method(self):
            pass

def outer_function():
    """Function docstring"""
    def inner_function():
        return "nested"
    return inner_function()

if __name__ == "__main__":
    print("main")`

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)

    // Verify reparsing produces identical blocks
    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    expect(reparsedBlocks.length).toBe(originalBlocks.length)
    for (let i = 0; i < originalBlocks.length; i++) {
      expect(reparsedBlocks[i].kind).toBe(originalBlocks[i].kind)
      expect(reparsedBlocks[i].text).toBe(originalBlocks[i].text)
    }
  })

  it("tests that parse/serialize is isomorphic for async functions and classes", async () => {
    const code = `"""Async module"""

import asyncio

async def async_function():
    await asyncio.sleep(0.1)
    return "async result"

class AsyncClass:
    async def async_method(self):
        await asyncio.sleep(0.1)
        return "async method result"`

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)

    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    expect(reparsedBlocks.length).toBe(originalBlocks.length)
    for (let i = 0; i < originalBlocks.length; i++) {
      expect(reparsedBlocks[i].text).toBe(originalBlocks[i].text)
    }
  })

  it("tests that parse/serialize is isomorphic for decorators and type hints", async () => {
    const code = `"""Type hints and decorators"""

from typing import List, Optional
from functools import wraps

def decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@decorator
def typed_function(items: List[str]) -> Optional[str]:
    return items[0] if items else None`

    const originalBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(code, "test.py")) {
      originalBlocks.push(block)
    }

    const serializedCode = serializeBlocksToPython(originalBlocks)
    expect(serializedCode).toBe(code)

    const reparsedBlocks: PyBlock[] = []
    for await (const block of parseCodeBlocks(serializedCode, "test.py")) {
      reparsedBlocks.push(block)
    }

    expect(reparsedBlocks.length).toBe(originalBlocks.length)
    for (let i = 0; i < originalBlocks.length; i++) {
      expect(reparsedBlocks[i].text).toBe(originalBlocks[i].text)
    }
  })
})
