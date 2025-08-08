import type { Block } from "@/types/parser";

/**
 * Generate a unique block ID from a block's name and kind.
 *
 * @param block - The block to generate an ID for
 * @returns A string in the format "lowercase(name)-kind"
 *
 * @example
 * ```typescript
 * const block = { kind: "function", name: "fibonacci", startByte: 0, endByte: 10, text: "def fibonacci():" };
 * const id = blockId(block); // "fibonacci-function"
 * ```
 *
 * @example
 * ```typescript
 * const block = { kind: "class", name: "Calculator", startByte: 0, endByte: 20, text: "class Calculator:" };
 * const id = blockId(block); // "calculator-class"
 * ```
 */
export function blockId<TKind = string>(block: Block<TKind>): string {
  const kind = String(block.kind).replace(/\s+/g, "-");
  const name = typeof block.name === "string" ? block.name : "anonymous";
  return `${name.toLowerCase()}-${kind}`;
}
