import { describe, it, expect } from "vitest";
import { parseCodeBlocks } from "@/lib/parser/python/py-blocks";
import { readFileSync } from "fs";
import { join } from "path";
import type { PyBlock } from "@/types/parser";

describe("Python parser", () => {
  describe("parseCodeBlocks", () => {
    it("should parse definition blocks", async () => {
      const code = readFileSync(join(__dirname, "py-code.txt"), "utf-8");

      const blocks: PyBlock[] = [];
      for await (const block of parseCodeBlocks(code)) {
        blocks.push(block);
      }

      expect(blocks.length).toBe(4); // 1 import block + 3 other blocks

      // Import block
      expect(blocks[0].kind).toBe("import");
      expect(blocks[0].text).toBe(
        "import math\nimport pandas as pd\n\nfrom dataclasses import dataclass\nfrom datetime import datetime"
      );

      expect(blocks[1].kind).toBe("decorated class");
      expect(blocks[1].text).toBe(
        "@dataclass\nclass Person:\n    name: str\n    age: int\n"
      );

      expect(blocks[2].kind).toBe("function");
      expect(blocks[2].text).toBe(
        "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n"
      );

      expect(blocks[3].kind).toBe("class");
      expect(blocks[3].text).toBe(
        "class Calculator:\n    def add(self, a, b):\n        return a + b"
      );
    });
  });
});
