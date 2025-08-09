import { readFile } from "node:fs/promises";
import { argv, exit } from "node:process";
import { pythonLanguage } from "@codemirror/lang-python";
import type { TreeCursor } from "@lezer/common";

function makeSnippet(
  text: string,
  from: number,
  to: number,
  maxLen: number = 80
): string {
  const slice = text.slice(from, to).replace(/\s+/g, " ").trim();
  if (slice.length <= maxLen) return slice;
  return `${slice.slice(0, maxLen - 1)}…`;
}

function printCursor(cursor: TreeCursor, text: string, indent: number): void {
  const pad = "  ".repeat(indent);
  const snippet = makeSnippet(text, cursor.from, cursor.to);
  // name [from,to] "snippet"
  console.log(
    `${pad}${cursor.name} [${cursor.from}, ${cursor.to}] "${snippet}"`
  );
  if (cursor.firstChild()) {
    do {
      printCursor(cursor, text, indent + 1);
    } while (cursor.nextSibling());
    cursor.parent();
  }
}

async function main(): Promise<void> {
  const filePath = argv[2];
  if (!filePath) {
    console.error(
      "usage: pnpm tsx scripts/print-py-nodes.ts <path-to-python-file>"
    );
    exit(1);
  }

  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (err) {
    console.error(`error reading file: ${String(err)}`);
    exit(1);
    return;
  }

  const tree = pythonLanguage.parser.parse(source);
  const cursor = tree.cursor();
  printCursor(cursor, source, 0);
}

void main();
