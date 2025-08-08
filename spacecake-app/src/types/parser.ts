import type { File } from "@/types/workspace";

// Anonymous type for blocks without a specific name
export type Anonymous = { readonly __anonymous: true };

// Helper to create Anonymous value
export const ANONYMOUS: Anonymous = { __anonymous: true } as const;

export interface Block<TKind = string> {
  kind: TKind;
  name: string | Anonymous;
  startByte: number;
  endByte: number;
  text: string;
}

// Python-specific block types
export type PyBlockKind = "class" | "function" | "imports" | "file";
export type PyBlockHigherKindPrefix = "async" | "decorated";
export type PyBlockHigherKind = `${PyBlockHigherKindPrefix} ${PyBlockKind}`;

// Python-specific block type
export type PyBlock = Block<PyBlockKind | PyBlockHigherKind>;

// Parsed file type that extends File with parsed blocks
export interface ParsedFile<TBlock = Block> extends File {
  // Parsed blocks
  blocks: TBlock[];
}

// Python-specific parsed file
export type PyParsedFile = ParsedFile<PyBlock>;

// For future language support, we can add:
// export type JsBlockKind = "class" | "function" | "import" | "export";
// export type JsBlock = Block<JsBlockKind>;
// export type JsParsedFile = ParsedFile<JsBlock>;
