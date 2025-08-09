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

      expect(blocks.length).toBe(6); // import, dataclass, function, class, misc, main

      // import block
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].text).toBe(
        "# a file to test block parsing\n\nimport math\nimport pandas as pd\n\nfrom dataclasses import dataclass\nfrom datetime import datetime"
      );

      expect(blocks[1].kind).toBe("dataclass");
      expect(blocks[1].text).toBe(
        "@dataclass\nclass Person:\n    name: str\n    age: int\n"
      );

      expect(blocks[2].kind).toBe("function");
      expect(blocks[2].text).toBe(
        "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n"
      );

      expect(blocks[3].kind).toBe("class");
      expect(blocks[3].text).toBe(
        "class Calculator:\n    def add(self, a, b):\n        return a + b\n"
      );

      // Misc block between class and main
      expect(blocks[4].kind).toBe("misc");
      expect(blocks[4].name.kind).toBe("anonymous");
      expect(blocks[4].text).toBe(
        `misc_var = True\nprint(f"here's a misc var: {misc_var}")`
      );

      expect(blocks[5].kind).toBe("main");
      expect(blocks[5].text).toBe(
        `if __name__ == "__main__":\n    text = input("echo: ")\n    print(text)`
      );
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
      expect(blocks[1].kind).toBe("function");
    });

    it("yields misc block between import and function", async () => {
      const code = "import os\n\n" + "x = 1\n\n" + "def f():\n    pass\n";

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(3);
      expect(blocks[0].kind).toBe("import");
      expect(blocks[1].kind).toBe("misc");
      expect(blocks[1].text).toBe("x = 1");
      expect(blocks[2].kind).toBe("function");
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
    });
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
    });
  });
});
