export type BlockKind = "class" | "function" | "import";
export type BlockHigherKindPrefix = "async" | "decorated";
export type BlockHigherKind = `${BlockHigherKindPrefix} ${BlockKind}`;

export type Block = {
  kind: BlockKind | BlockHigherKind;
  startByte: number;
  endByte: number;
  text: string;
};
