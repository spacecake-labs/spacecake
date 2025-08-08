import { describe, it, expect } from "vitest";
import { blockId } from "@/lib/parser/block-id";
import type { Block, PyBlock } from "@/types/parser";
import { anonymousName, namedBlock } from "@/types/parser";

describe("blockId", () => {
  it("should generate correct ID for function blocks", () => {
    const block: PyBlock = {
      kind: "function",
      name: namedBlock("fibonacci"),
      startByte: 0,
      endByte: 50,
      text: "def fibonacci(n):\n    return n",
    };

    expect(blockId(block)).toBe("fibonacci-function");
  });

  it("should generate correct ID for class blocks", () => {
    const block: PyBlock = {
      kind: "class",
      name: namedBlock("Calculator"),
      startByte: 0,
      endByte: 100,
      text: "class Calculator:\n    pass",
    };

    expect(blockId(block)).toBe("calculator-class");
  });

  it("should generate correct ID for import blocks", () => {
    const block: PyBlock = {
      kind: "imports",
      name: anonymousName(),
      startByte: 0,
      endByte: 20,
      text: "import math\nimport os",
    };

    expect(blockId(block)).toBe("anonymous-imports");
  });

  it("should generate correct ID for decorated function blocks", () => {
    const block: PyBlock = {
      kind: "decorated function",
      name: namedBlock("myMethod"),
      startByte: 0,
      endByte: 80,
      text: "@property\ndef myMethod(self):\n    return self._value",
    };

    expect(blockId(block)).toBe("mymethod-decorated-function");
  });

  it("should handle uppercase names by converting to lowercase", () => {
    const block: PyBlock = {
      kind: "class",
      name: namedBlock("MyBigClassName"),
      startByte: 0,
      endByte: 30,
      text: "class MyBigClassName:\n    pass",
    };

    expect(blockId(block)).toBe("mybigclassname-class");
  });

  it("should work with generic Block type", () => {
    const block: Block<string> = {
      kind: "custom",
      name: namedBlock("TestBlock"),
      startByte: 0,
      endByte: 10,
      text: "test",
    };

    expect(blockId(block)).toBe("testblock-custom");
  });

  it("should handle file blocks", () => {
    const block: PyBlock = {
      kind: "file",
      name: namedBlock("file"),
      startByte: 0,
      endByte: 200,
      text: "# entire file content",
    };

    expect(blockId(block)).toBe("file-file");
  });

  it("should replace spaces in kind with dashes", () => {
    const block: PyBlock = {
      kind: "decorated class",
      name: namedBlock("MyClass"),
      startByte: 0,
      endByte: 50,
      text: "@dataclass\nclass MyClass:\n    pass",
    };

    expect(blockId(block)).toBe("myclass-decorated-class");
  });

  it("should handle Anonymous name type", () => {
    const block: PyBlock = {
      kind: "file",
      name: anonymousName(),
      startByte: 0,
      endByte: 100,
      text: "# Some file content",
    };

    expect(blockId(block)).toBe("anonymous-file");
  });
});
