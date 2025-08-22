import {
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  $applyNodeReplacement,
} from "lexical";
import React, { JSX } from "react";
import { CodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor";
import type { Block } from "@/types/parser";

// Simple void emitter for focus events - only allows one subscription
const voidEmitter = () => {
  let subscription = () => {}; // noop
  return {
    publish: () => {
      subscription();
    },
    subscribe: (cb: () => void) => {
      subscription = cb;
    },
  };
};

/**
 * The options necessary to construct a new code block node.
 */
export interface CreateCodeBlockNodeOptions {
  /**
   * The code contents of the block.
   */
  code: string;
  /**
   * The language of the code block (i.e. `js`, `jsx`, etc.). This is used for syntax highlighting.
   */
  language: string;
  /**
   * The additional meta data of the block.
   */
  meta: string;
  /**
   * The source file path/name for the code block.
   */
  src?: string;
  /**
   * The parsed block object containing kind, name, and other metadata.
   */
  block?: Block;
}

/**
 * A serialized representation of a CodeBlockNode.
 */
export type SerializedCodeBlockNode = Spread<
  CreateCodeBlockNodeOptions & { type: "codeblock"; version: 1 },
  SerializedLexicalNode
>;

/**
 * A lexical node that represents a fenced code block.
 */
export class CodeBlockNode extends DecoratorNode<JSX.Element> {
  __code: string;
  __meta: string;
  __language: string;
  __src?: string;
  __block?: Block;
  __focusEmitter = voidEmitter();

  static getType(): string {
    return "codeblock";
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(
      node.__code,
      node.__language,
      node.__meta,
      node.__src,
      node.__block,
      node.__key
    );
  }

  static importJSON(serializedNode: SerializedCodeBlockNode): CodeBlockNode {
    const { code, meta, language, src } = serializedNode;
    return $createCodeBlockNode({
      code,
      language,
      meta,
      src,
    });
  }

  static importDOM(): DOMConversionMap {
    return {
      pre: () => {
        return {
          conversion: $convertPreElement,
          priority: 3,
        };
      },
    };
  }

  constructor(
    code: string,
    language: string,
    meta: string,
    src?: string,
    block?: Block,
    key?: NodeKey
  ) {
    super(key);
    this.__code = code;
    this.__meta = meta;
    this.__language = language;
    this.__src = src;
    this.__block = block;
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      code: this.getCode(),
      language: this.getLanguage(),
      meta: this.getMeta(),
      src: this.getSrc(),
      type: "codeblock",
      version: 1,
    };
  }

  // View
  createDOM(): HTMLDivElement {
    const div = document.createElement("div");
    // Padding between code blocks
    div.className = "mt-2";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  getCode(): string {
    return this.__code;
  }

  getTextContent(): string {
    return this.getCode();
  }

  getMeta(): string {
    return this.__meta;
  }

  getLanguage(): string {
    return this.__language;
  }

  getSrc(): string | undefined {
    return this.__src;
  }

  getBlock(): Block {
    return (
      this.__block || {
        kind: "code",
        name: { kind: "anonymous", value: "anonymous" },
        startByte: 0,
        endByte: this.__code.length,
        text: this.__code,
        startLine: 1,
      }
    );
  }

  setCode = (code: string) => {
    if (code !== this.__code) {
      this.getWritable().__code = code;
    }
  };

  setMeta = (meta: string) => {
    if (meta !== this.__meta) {
      this.getWritable().__meta = meta;
    }
  };

  setLanguage = (language: string) => {
    if (language !== this.__language) {
      this.getWritable().__language = language;
    }
  };

  setSrc = (src: string | undefined) => {
    if (src !== this.__src) {
      this.getWritable().__src = src;
    }
  };

  select = () => {
    // small delay so DOM selection updates settle before focusing codemirror
    setTimeout(() => {
      this.__focusEmitter.publish();
    }, 50);
  };

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <CodeBlockEditorContainer
        parentEditor={editor}
        code={this.getCode()}
        meta={this.getMeta()}
        language={this.getLanguage()}
        src={this.getSrc()}
        block={this.getBlock()}
        codeBlockNode={this}
        nodeKey={this.getKey()}
        focusEmitter={this.__focusEmitter}
      />
    );
  }

  isInline(): boolean {
    return false;
  }
}

/**
 * A set of functions that modify the underlying code block node.
 */
export interface CodeBlockEditorContextValue {
  /**
   * Updates the code contents of the code block.
   */
  setCode: (code: string) => void;
  /**
   * Updates the language of the code block.
   */
  setLanguage: (language: string) => void;
  /**
   * Updates the meta of the code block.
   */
  setMeta: (meta: string) => void;
  /**
   * Updates the source file path of the code block.
   */
  setSrc: (src: string | undefined) => void;
  /**
   * The Lexical node that's being edited.
   */
  lexicalNode: CodeBlockNode;
  /**
   * The parent Lexical editor.
   */
  parentEditor: LexicalEditor;
  /**
   * The source file path for the code block.
   */
  src?: string;
}

const CodeBlockEditorContext =
  React.createContext<CodeBlockEditorContextValue | null>(null);

const CodeBlockEditorContextProvider: React.FC<{
  parentEditor: LexicalEditor;
  lexicalNode: CodeBlockNode;
  src?: string;
  children: React.ReactNode;
}> = ({ parentEditor, lexicalNode, src, children }) => {
  const contextValue = React.useMemo(() => {
    return {
      lexicalNode,
      parentEditor,
      src,
      setCode: (code: string) => {
        parentEditor.update(() => {
          lexicalNode.setCode(code);
        });
      },
      setLanguage: (language: string) => {
        parentEditor.update(() => {
          lexicalNode.setLanguage(language);
        });
      },
      setMeta: (meta: string) => {
        parentEditor.update(() => {
          lexicalNode.setMeta(meta);
        });
      },
      setSrc: (src: string | undefined) => {
        parentEditor.update(() => {
          lexicalNode.setSrc(src);
        });
      },
    };
  }, [lexicalNode, parentEditor, src]);

  return (
    <CodeBlockEditorContext.Provider value={contextValue}>
      {children}
    </CodeBlockEditorContext.Provider>
  );
};

/**
 * Use this hook in your custom code block editors to modify the underlying node code, language, and meta.
 */
export function useCodeBlockEditorContext() {
  const context = React.useContext(CodeBlockEditorContext);
  if (!context) {
    throw new Error("useCodeBlockEditor must be used within a CodeBlockEditor");
  }
  return context;
}

interface CodeBlockEditorProps {
  code: string;
  language: string;
  meta: string;
  src?: string;
  block: Block;
  nodeKey: string;
  focusEmitter: {
    publish: () => void;
    subscribe: (cb: () => void) => void;
  };
}

const CodeBlockEditorContainer: React.FC<
  {
    /** The Lexical editor that contains the node */
    parentEditor: LexicalEditor;
    /** The Lexical node that is being edited */
    codeBlockNode: CodeBlockNode;
  } & CodeBlockEditorProps
> = (props) => {
  return (
    <CodeBlockEditorContextProvider
      parentEditor={props.parentEditor}
      lexicalNode={props.codeBlockNode}
      src={props.src}
    >
      <CodeMirrorEditor
        code={props.code}
        language={props.language}
        block={props.block}
        nodeKey={props.nodeKey}
        focusEmitter={props.focusEmitter}
      />
    </CodeBlockEditorContextProvider>
  );
};

/**
 * Creates a CodeBlockNode.
 */
export function $createCodeBlockNode(
  options: Partial<CreateCodeBlockNodeOptions>
): CodeBlockNode {
  return $applyNodeReplacement(
    new CodeBlockNode(
      options.code ?? "",
      options.language ?? "",
      options.meta ?? "",
      options.src,
      options.block
    )
  );
}

/**
 * Returns true if the given node is a CodeBlockNode.
 */
export function $isCodeBlockNode(
  node: LexicalNode | null | undefined
): node is CodeBlockNode {
  return node instanceof CodeBlockNode;
}

/**
 * Converts a <pre> HTML element into a CodeBlockNode.
 */
export function $convertPreElement(element: Element): DOMConversionOutput {
  const preElement = element as HTMLPreElement;
  const code = preElement.textContent ?? "";
  // Get language from class if available (e.g., class="language-javascript")
  const classAttribute = element.getAttribute("class") ?? "";
  const dataLanguageAttribute = element.getAttribute("data-language") ?? "";
  const languageMatch = classAttribute.match(/language-(\w+)/);
  const language = languageMatch ? languageMatch[1] : dataLanguageAttribute;
  const meta = preElement.getAttribute("data-meta") ?? "";
  const src = preElement.getAttribute("data-src") ?? undefined;
  return {
    node: $createCodeBlockNode({ code, language, meta, src }),
  };
}
