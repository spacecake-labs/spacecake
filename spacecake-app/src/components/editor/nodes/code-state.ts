// import { createState, $getState, $setState } from "lexical";
// import { CodeNode } from "@lexical/code";

// export type CodeMetadata = {
//   block: string;
//   language: string;
//   theme?: string;
// };

// function parse(v: unknown): CodeMetadata {
//   if (typeof v === "string") {
//     try {
//       // To do: add safer parsing
//       return JSON.parse(v);
//     } catch {
//       // Return default if parsing fails
//       return {
//         block: "",
//         language: "",
//         theme: undefined,
//       };
//     }
//   }

//   return {
//     block: "",
//     language: "",
//     theme: undefined,
//   };
// }

// function unparse(v: CodeMetadata): string {
//   return JSON.stringify(v);
// }

// const codeState = createState("__code_metadata", { parse, unparse });

// export function getCodeMetadata(node: CodeNode): CodeMetadata {
//   return (
//     $getState(node, codeState) || {
//       block: "",
//       language: node.getLanguage() || "",
//       theme: undefined,
//     }
//   );
// }

// export function setCodeMetadata(
//   node: CodeNode,
//   metadata: Partial<CodeMetadata>
// ): void {
//   const current = getCodeMetadata(node);
//   $setState(node, codeState, { ...current, ...metadata });
// }

// export function getCodeBlock(node: CodeNode): string {
//   return getCodeMetadata(node).block;
// }

// export function setCodeBlock(node: CodeNode, block: string): void {
//   setCodeMetadata(node, { block });
// }

// export function getCodeTheme(node: CodeNode): string | undefined {
//   return getCodeMetadata(node).theme;
// }

// export function setCodeTheme(node: CodeNode, theme: string): void {
//   setCodeMetadata(node, { theme });
// }
