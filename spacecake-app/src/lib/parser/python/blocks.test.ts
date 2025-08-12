import { describe, it, expect } from "vitest";
import {
  parseCodeBlocks,
  parsePythonContentStreaming,
} from "@/lib/parser/python/blocks";
import { readFileSync } from "fs";
import { join } from "path";
import type { PyBlock } from "@/types/parser";

describe("Python parser", () => {
  describe("parseCodeBlocks", () => {
    it("should parse blocks from core.py", async () => {
      const code = readFileSync(
        join(__dirname, "../../../../tests/fixtures/core.py"),
        "utf-8"
      );

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(7); // doc, import, dataclass, function, class, misc, main

      expect(blocks[0].kind).toBe("doc");
      expect(blocks[0].text).toBe('"""A file to test block parsing."""');
      expect(blocks[0].startLine).toBe(1);

      // import block
      expect(blocks[1].kind).toBe("import");
      expect(blocks[1].text).toBe(
        "import math\nimport pandas as pd\n\nfrom dataclasses import dataclass\nfrom datetime import datetime"
      );
      expect(blocks[1].startLine).toBe(3);

      expect(blocks[2].kind).toBe("dataclass");
      expect(blocks[2].text).toBe(
        "@dataclass\nclass Person:\n    name: str\n    age: int\n"
      );
      expect(blocks[2].startLine).toBe(9);

      expect(blocks[3].kind).toBe("function");
      expect(blocks[3].text).toBe(
        "# fibonacci function\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n"
      );
      expect(blocks[3].startLine).toBe(14);

      expect(blocks[4].kind).toBe("class");
      expect(blocks[4].text).toBe(
        "class Calculator:\n    def add(self, a, b):\n        return a + b\n"
      );
      expect(blocks[4].startLine).toBe(20);

      // Misc block between class and main
      expect(blocks[5].kind).toBe("misc");
      expect(blocks[5].name.kind).toBe("anonymous");
      expect(blocks[5].text).toBe(
        `misc_var = True\nprint(f"here's a misc var: {misc_var}")`
      );
      expect(blocks[5].startLine).toBe(24);

      expect(blocks[6].kind).toBe("main");
      expect(blocks[6].text).toBe(
        `if __name__ == "__main__":\n    text = input("echo: ")\n    print(text)`
      );
      expect(blocks[6].startLine).toBe(27);
    });

    it("parses module description in import block", async () => {
      const code =
        "# module header\nimport os\nimport sys\n\n\n" + "def f():\n    pass\n";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(2);
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].text).toBe("# module header\nimport os\nimport sys");
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[1].kind).toBe("function");
      expect(blocks[1].startLine).toBe(6);
    });

    it("yields misc block between import and function", async () => {
      const code = "import os\n\n" + "x = 1\n\n" + "def f():\n    pass\n";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(3);
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[1].kind).toBe("misc");
      expect(blocks[1].text).toBe("x = 1");
      expect(blocks[1].startLine).toBe(3);
      expect(blocks[2].kind).toBe("function");
      expect(blocks[2].startLine).toBe(5);
    });

    it("yields import block at EOF", async () => {
      const code = "from dataclasses import dataclass";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(1);
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].text).toBe("from dataclasses import dataclass");
      expect(blocks[0].startLine).toBe(1);
    });

    it("yields misc block at EOF", async () => {
      const code = "def f():\n    return 1\n\n" + "x = 2\n";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(2);
      expect(blocks[0].kind).toBe("function");
      expect(blocks[1].kind).toBe("misc");
      expect(blocks[1].text).toBe("x = 2");
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[1].startLine).toBe(4);
    });

    it("yields docblock at EOF", async () => {
      const code = '"""A docstring"""';

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(1);
      expect(blocks[0].kind).toBe("doc");
      expect(blocks[0].text).toBe('"""A docstring"""');
      expect(blocks[0].startLine).toBe(1);
    });

    it("accumulates comments in import block", async () => {
      const code = "# a comment\nimport os";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(1);
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].text).toBe("# a comment\nimport os");
      expect(blocks[0].startLine).toBe(1);
    });

    it("accumulates comments in docblock", async () => {
      const code = `# a comment\n"""A docstring"""`;

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(1);
      expect(blocks[0].kind).toBe("doc");
      expect(blocks[0].text).toBe(`# a comment\n"""A docstring"""`);
      expect(blocks[0].startLine).toBe(1);
    });
  });

  it("accumulates comments in misc block", async () => {
    const code = `# a comment\nprint("hello")`;

    const blocks: PyBlock[] = [];
    for await (const block of parseCodeBlocks(code)) {
      blocks.push(block);
    }

    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("misc");
    expect(blocks[0].text).toBe(`# a comment\nprint("hello")`);
    expect(blocks[0].startLine).toBe(1);
  });

  it("accumulates comments in function block", async () => {
    const code = `# a comment\ndef f():\n    pass`;

    const blocks: PyBlock[] = [];
    for await (const block of parseCodeBlocks(code)) {
      blocks.push(block);
    }

    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("function");
    expect(blocks[0].text).toBe(`# a comment\ndef f():\n    pass`);
    expect(blocks[0].startLine).toBe(1);
  });

  describe("fallback block naming", () => {
    it("uses anonymous name when no blocks are parsed", async () => {
      const content = "# just comments or empty file\n";
      const blocks: PyBlock[] = [];
      for await (const block of parsePythonContentStreaming(content)) {
        blocks.push(block);
      }

      // with the new approach, the parser will still yield a single 'file' fallback
      expect(blocks.length).toBe(1);
      expect(blocks[0].kind).toBe("file");
      expect(blocks[0].name.kind).toBe("anonymous");
      expect(blocks[0].text).toBe(content);
      expect(blocks[0].startLine).toBe(1);
    });
  });
});
