// import {
//   DecoratorNode,
//   LexicalNode,
//   NodeKey,
//   SerializedLexicalNode,
// } from "lexical";
// import { EditorView, basicSetup } from "codemirror";
// import { javascript } from "@codemirror/lang-javascript";
// import { oneDark } from "@codemirror/theme-one-dark";

// export type SerializedCodeMirrorNode = SerializedLexicalNode & {
//   code: string;
//   language: string;
// };

// export class CodeMirrorNode extends DecoratorNode<EditorView> {
//   __code: string;
//   __language: string;

//   constructor(code: string, language: string, key?: NodeKey) {
//     super(key);
//     this.__code = code;
//     this.__language = language;
//   }

//   static getType(): string {
//     return "codemirror";
//   }

//   static clone(node: CodeMirrorNode): CodeMirrorNode {
//     return new CodeMirrorNode(node.__code, node.__language, node.__key);
//   }

//   createDOM(): HTMLElement {
//     const dom = document.createElement("div");
//     dom.className = "codemirror-container";
//     return dom;
//   }

//   updateDOM(): boolean {
//     return false;
//   }

//   decorate(): EditorView {
//     const dom = this.getDOM();

//     return new EditorView({
//       doc: this.__code,
//       extensions: [
//         basicSetup,
//         javascript(),
//         oneDark,
//         EditorView.updateListener.of((update) => {
//           if (update.docChanged) {
//             this.__code = update.state.doc.toString();
//             this.markDirty();
//           }
//         }),
//       ],
//       parent: dom,
//     });
//   }

//   exportJSON(): SerializedCodeMirrorNode {
//     return {
//       ...super.exportJSON(),
//       code: this.__code,
//       language: this.__language,
//     };
//   }

//   static importJSON(serializedNode: SerializedCodeMirrorNode): CodeMirrorNode {
//     return new CodeMirrorNode(serializedNode.code, serializedNode.language);
//   }
// }
