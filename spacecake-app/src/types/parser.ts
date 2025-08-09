import type { File } from "@/types/workspace";

// Discriminated union for block names
export type BlockName =
  | { kind: "anonymous"; value: "anonymous" }
  | { kind: "named"; value: string };

// Helper constructors
export const anonymousName = (): BlockName => ({
  kind: "anonymous",
  value: "anonymous",
});
export const namedBlock = (value: string): BlockName => ({
  kind: "named",
  value,
});

// Type guards
export const isAnonymousName = (
  name: BlockName
): name is { kind: "anonymous"; value: "anonymous" } =>
  name.kind === "anonymous";
export const isNamedBlock = (
  name: BlockName
): name is { kind: "named"; value: string } => name.kind === "named";

export interface Block<TKind = string> {
  kind: TKind;
  name: BlockName;
  startByte: number;
  endByte: number;
  text: string;
}

// Python-specific block types
export type PyBlockKind =
  | "class"
  | "function"
  | "import"
  | "file"
  | "dataclass"
  | "main";
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
