// /**
//  * @file Tree-sitter based parser for Python code into blocks.
//  */
// import Parser, { SyntaxNode, Language } from "tree-sitter";
// import Python from "tree-sitter-python";

// import type {
//   PyBlock,
//   PyBlockKind,
//   PyBlockHigherKind,
//   BlockName,
//   DelimitedString,
// } from "@/types/parser";
// import { anonymousName, namedBlock } from "@/types/parser";
// import { parseDelimitedString } from "@/lib/parser/delimited-string";
// import { fnv1a64Hex } from "@/lib/hash";

// /**
//  * Convert a docstring block to markdown header text.
//  */
// export function delimitDocString(block: PyBlock): DelimitedString {
//   // parseDelimitedString handles all the pattern matching automatically
//   return parseDelimitedString(block.text, {
//     prefixPattern: /^(r?""")/, // consume r""" or """ at start
//     suffixPattern: /"""$/, // consume """ at end
//   });
// }

// export function delimitCodeString(block: PyBlock): DelimitedString {
//   const result = parseDelimitedString(block.text, {
//     prefixPattern: /^[\s\n]*/, // consume any leading whitespace and newlines
//     suffixPattern: /[\s\n]*$/, // consume any trailing whitespace and newlines
//   });

//   return result;
// }

// const parser = new Parser();
// parser.setLanguage(Python as Language);

// function isDataclass(node: SyntaxNode): boolean {
//   if (node.type !== "decorated_definition") return false;

//   const hasDataclassName = (decoratorNode: SyntaxNode): boolean => {
//     let found = false;
//     function walk(n: SyntaxNode) {
//       if (n.type === "identifier" && n.text === "dataclass") {
//         found = true;
//       }
//       if (found) return;
//       for (const child of n.children) {
//         walk(child);
//       }
//     }
//     walk(decoratorNode);
//     return found;
//   };

//   for (const child of node.children) {
//     if (child.type === "decorator") {
//       if (hasDataclassName(child)) {
//         return true;
//       }
//     }
//   }
//   return false;
// }

// function isDocstring(node: SyntaxNode): boolean {
//   if (node.type !== "expression_statement") return false;

//   // must be a string literal
//   const stringNode = node.namedChild(0);
//   if (!stringNode || stringNode.type !== "string" || node.namedChild(1)) {
//     return false;
//   }

//   // Check for triple quotes using child nodes
//   const firstChild = stringNode.firstChild;
//   const lastChild = stringNode.lastChild;

//   if (!firstChild || !lastChild) return false;

//   // Check if it's a triple-quoted string
//   const isTripleQuoted =
//     firstChild.type === "string_start" &&
//     lastChild.type === "string_end" &&
//     (firstChild.text === '"""' || firstChild.text === 'r"""');

//   if (!isTripleQuoted) {
//     return false;
//   }

//   // check if it's the first statement in the parent body
//   const parent = node.parent;
//   if (!parent) return false;

//   if (parent.type === "block" || parent.type === "module") {
//     // 'block' is for function/class bodies
//     // 'module' is for top-level
//     for (const child of parent.children) {
//       if (child.type === "comment") continue;
//       // first non-comment child must be our node
//       return child.id === node.id;
//     }
//   }

//   return false;
// }

// function blockKind(node: SyntaxNode): PyBlockKind | PyBlockHigherKind | null {
//   switch (node.type) {
//     case "expression_statement": {
//       if (isDocstring(node)) return "doc";
//       return null;
//     }
//     case "class_definition":
//       return "class";
//     case "function_definition":
//       return "function";
//     case "import_statement":
//       return "import";
//     case "import_from_statement":
//       return "import";
//     case "decorated_definition": {
//       const definition = node.lastNamedChild;
//       if (!definition) return null;

//       const childKind = blockKind(definition);
//       if (!childKind) return null;
//       if (childKind === "class" && isDataclass(node)) {
//         return "dataclass";
//       }
//       return `decorated ${childKind}` as PyBlockHigherKind;
//     }
//     case "if_statement": {
//       const conditionNode = node.childForFieldName("condition");
//       if (!conditionNode) return null;
//       const conditionText = conditionNode.text;
//       if (/^__name__\s*==\s*(['"])__main__\1$/.test(conditionText)) {
//         return "main";
//       }
//       return null;
//     }
//     default:
//       return null;
//   }
// }

// function blockName(node: SyntaxNode): BlockName {
//   switch (node.type) {
//     case "if_statement":
//       return anonymousName();
//     case "class_definition": {
//       const nameNode = node.childForFieldName("name");
//       return nameNode ? namedBlock(nameNode.text) : anonymousName();
//     }
//     case "function_definition": {
//       const nameNode = node.childForFieldName("name");
//       return nameNode ? namedBlock(nameNode.text) : anonymousName();
//     }
//     case "import_statement":
//     case "import_from_statement": {
//       return anonymousName();
//     }
//     case "decorated_definition": {
//       const definition = node.lastNamedChild;
//       if (definition) {
//         return blockName(definition);
//       }
//       return namedBlock("decorated");
//     }
//     default:
//       return anonymousName();
//   }
// }

// export function* parseCodeBlocks(code: string): Generator<PyBlock> {
//   const tree = parser.parse(code);
//   let importNodes: SyntaxNode[] = [];
//   let miscNodes: SyntaxNode[] = [];
//   let commentNodes: SyntaxNode[] = [];
//   let prevBlockEndByte = 0;

//   const countLinesBefore = (byte: number): number => {
//     const before = code.substring(0, byte);
//     const lines = (before.match(/\n/g) || []).length;
//     return lines + 1;
//   };

//   const emitImportBlock = (): PyBlock => {
//     const firstImport = importNodes[0];
//     const lastImport = importNodes[importNodes.length - 1];

//     const startByte = prevBlockEndByte;
//     const raw = code.slice(startByte, lastImport.endIndex);
//     const name = blockName(firstImport);
//     const block: PyBlock = {
//       kind: "import",
//       name,
//       startByte,
//       endByte: lastImport.endIndex,
//       text: raw,
//       startLine: countLinesBefore(firstImport.startIndex),
//       cid: computeCid("import", name.value, raw),
//       cidAlgo: "fnv1a64-norm1",
//     };
//     importNodes = [];
//     return block;
//   };

//   const emitMiscBlock = (): PyBlock => {
//     const first = miscNodes[0];
//     const last = miscNodes[miscNodes.length - 1];
//     const startByte = prevBlockEndByte;
//     const raw = code.slice(startByte, last.endIndex);
//     const block: PyBlock = {
//       kind: "misc",
//       name: anonymousName(),
//       startByte,
//       endByte: last.endIndex,
//       text: raw,
//       startLine: countLinesBefore(first.startIndex),
//       cid: computeCid("misc", "anonymous", raw),
//       cidAlgo: "fnv1a64-norm1",
//     };
//     miscNodes = [];
//     return block;
//   };

//   for (const node of tree.rootNode.children) {
//     const kind = blockKind(node);

//     if (!kind) {
//       if (node.type === "ERROR") continue;
//       if (node.type === "comment") {
//         commentNodes.push(node);
//         continue;
//       }
//       miscNodes.push(...commentNodes, node);
//       commentNodes = [];
//       continue;
//     }

//     if (kind === "import") {
//       importNodes.push(...commentNodes, node);
//       commentNodes = [];
//       continue;
//     }

//     if (importNodes.length) {
//       const importBlock = emitImportBlock();
//       prevBlockEndByte = importBlock.endByte;
//       yield importBlock;
//     }

//     if (miscNodes.length) {
//       const miscBlock = emitMiscBlock();
//       prevBlockEndByte = miscBlock.endByte;
//       yield miscBlock;
//     }

//     const startByte = prevBlockEndByte;
//     const raw = code.slice(startByte, node.endIndex);
//     const name = blockName(node);

//     const nodeFrom = commentNodes.length
//       ? commentNodes[0].startIndex
//       : node.startIndex;

//     commentNodes = [];
//     prevBlockEndByte = node.endIndex;

//     yield {
//       kind,
//       name,
//       startByte,
//       endByte: node.endIndex,
//       text: raw,
//       startLine: countLinesBefore(nodeFrom),
//       cid: computeCid(kind, name.value, raw),
//       cidAlgo: "fnv1a64-norm1",
//     };
//   }

//   if (importNodes.length) {
//     const importBlock = emitImportBlock();
//     yield importBlock;
//   }
//   if (miscNodes.length) {
//     const miscBlock = emitMiscBlock();
//     yield miscBlock;
//   }
// }

// /**
//  * Parse Python content into blocks with error handling
//  * Returns a generator that yields blocks as they're parsed
//  */
// export function* parsePythonContentStreaming(
//   content: string
// ): Generator<PyBlock> {
//   try {
//     let blockCount = 0;
//     for (const block of parseCodeBlocks(content)) {
//       blockCount++;
//       yield block;
//     }

//     // If no blocks were parsed, fall back to a single "file" block
//     if (blockCount === 0) {
//       const fallbackBlock: PyBlock = {
//         kind: "file",
//         name: anonymousName(),
//         startByte: 0,
//         endByte: content.length,
//         text: content,
//         startLine: 1,
//         cid: computeCid("file", "anonymous", content),
//         cidAlgo: "fnv1a64-norm1",
//       };
//       yield fallbackBlock;
//     }
//   } catch (error) {
//     console.warn("failed to parse python content into blocks:", error);

//     // Fallback: create a single block with the entire content
//     const fallbackBlock: PyBlock = {
//       kind: "file",
//       name: anonymousName(),
//       startByte: 0,
//       endByte: content.length,
//       text: content,
//       startLine: 1,
//       cid: computeCid("file", "anonymous", content),
//       cidAlgo: "fnv1a64-norm1",
//     };

//     yield fallbackBlock;
//   }
// }

// /**
//  * Serialize Python blocks back to source code.
//  * This is used to test that parse/serialize is isomorphic.
//  */
// export function serializeBlocksToPython(blocks: PyBlock[]): string {
//   return blocks.map((block) => block.text).join("");
// }

// function computeCid(
//   kind: string,
//   name: string,
//   normalizedText: string
// ): string {
//   const sep = "\x1f";
//   return fnv1a64Hex(kind + sep + name + sep + normalizedText);
// }
