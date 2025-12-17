import React, { JSX } from "react"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import {
  $addUpdateTag,
  $applyNodeReplacement,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SKIP_DOM_SELECTION_TAG,
  Spread,
} from "lexical"

import type { LanguageSpec } from "@/types/language"
import type { Block } from "@/types/parser"
import { CodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor"

type CodeMirrorLanguage = LanguageSpec["codemirrorName"]

// Focus management interface for CodeMirror integration
export interface CodeMirrorFocusManager {
  focus: () => void
}

// WeakMap to store focus managers for code block nodes
const focusManagerMap = new WeakMap<CodeBlockNode, CodeMirrorFocusManager>()

/**
 * The options necessary to construct a new code block node.
 */
export interface CreateCodeBlockNodeOptions {
  code: string
  language: CodeMirrorLanguage
  meta: string
  src: string
  block: Block
}

/**
 * A serialized representation of a CodeBlockNode.
 */
export type SerializedCodeBlockNode = Spread<
  CreateCodeBlockNodeOptions & { type: "codeblock"; version: 1 },
  SerializedLexicalNode
>

/**
 * A lexical node that represents a fenced code block.
 */
export class CodeBlockNode extends DecoratorNode<JSX.Element> {
  __code: string
  __meta: string
  __language: CodeMirrorLanguage
  __src: string
  __block: Block

  static getType(): string {
    return "codeblock"
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(
      node.__code,
      node.__language,
      node.__meta,
      node.__src,
      node.__block,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedCodeBlockNode): CodeBlockNode {
    const { code, meta, language, src, block } = serializedNode
    const node = $createCodeBlockNode({
      code,
      language,
      meta,
      src,
      block,
    })
    // necessary to keep node state (delimiters)
    return node.updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap {
    return {
      pre: () => {
        return {
          conversion: $convertPreElement,
          priority: 3,
        }
      },
    }
  }

  constructor(
    code: string,
    language: CodeMirrorLanguage,
    meta: string,
    src: string,
    block: Block,
    key?: NodeKey
  ) {
    super(key)
    this.__code = code
    this.__meta = meta
    this.__language = language
    this.__src = src
    this.__block = block
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      ...super.exportJSON(),
      code: this.getCode(),
      language: this.getLanguage(),
      meta: this.getMeta(),
      src: this.getSrc(),
      block: this.getBlock(),
      type: "codeblock",
      version: 1,
    }
  }

  // View
  createDOM(): HTMLDivElement {
    const div = document.createElement("div")
    // Padding between code blocks
    div.className = "mt-2"
    return div
  }

  updateDOM(): false {
    return false
  }

  getCode(): string {
    return this.__code
  }

  // This is called by Lexica's `$convertToMarkdownString` function
  getTextContent(): string {
    return this.__code
  }

  getMeta(): string {
    return this.__meta
  }

  getLanguage(): CodeMirrorLanguage {
    return this.__language
  }

  getSrc(): string {
    return this.__src
  }

  getBlock(): Block {
    return this.__block
  }

  setCode = (code: string) => {
    if (code !== this.__code) {
      this.getWritable().__code = code
    }
  }

  setMeta = (meta: string) => {
    if (meta !== this.__meta) {
      this.getWritable().__meta = meta
    }
  }

  setLanguage = (language: CodeMirrorLanguage) => {
    if (language !== this.__language) {
      this.getWritable().__language = language
    }
  }

  setSrc = (src: string) => {
    if (src !== this.__src) {
      this.getWritable().__src = src
    }
  }

  setBlock = (block: Block) => {
    if (block !== this.__block) {
      this.getWritable().__block = block
    }
  }

  select = () => {
    // focus the CodeMirror editor directly
    const focusManager = focusManagerMap.get(this)
    focusManager?.focus()
  }

  setFocusManager = (focusManager: CodeMirrorFocusManager) => {
    focusManagerMap.set(this, focusManager)
  }

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
      />
    )
  }

  isInline(): boolean {
    return false
  }
}

/**
 * A set of functions that modify the underlying code block node.
 */
export interface CodeBlockEditorContextValue {
  setCode: (code: string) => void
  setLanguage: (language: CodeMirrorLanguage) => void
  setMeta: (meta: string) => void
  setSrc: (src: string) => void
  lexicalNode: CodeBlockNode
  parentEditor: LexicalEditor
  src: string
}

const CodeBlockEditorContext =
  React.createContext<CodeBlockEditorContextValue | null>(null)

const CodeBlockEditorContextProvider: React.FC<{
  parentEditor: LexicalEditor
  lexicalNode: CodeBlockNode
  src: string
  children: React.ReactNode
}> = ({ parentEditor, lexicalNode, src, children }) => {
  const contextValue = React.useMemo(() => {
    return {
      lexicalNode,
      parentEditor,
      src,
      setCode: (code: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          lexicalNode.setCode(code)
        })
      },
      setLanguage: (language: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          lexicalNode.setLanguage(language)
        })
      },
      setMeta: (meta: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          lexicalNode.setMeta(meta)
        })
      },
      setSrc: (src: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          lexicalNode.setSrc(src)
        })
      },
    }
  }, [lexicalNode, parentEditor, src])

  return (
    <CodeBlockEditorContext.Provider value={contextValue}>
      {children}
    </CodeBlockEditorContext.Provider>
  )
}

/**
 * Use this hook in your custom code block editors to modify the underlying node code, language, and meta.
 */
export function useCodeBlockEditorContext() {
  const context = React.useContext(CodeBlockEditorContext)
  if (!context) {
    throw new Error("useCodeBlockEditor must be used within a CodeBlockEditor")
  }
  return context
}

interface CodeBlockEditorProps {
  code: string
  language: CodeMirrorLanguage
  meta: string
  src: string
  block: Block
  nodeKey: string
}

const CodeBlockEditorContainer: React.FC<
  {
    /** The Lexical editor that contains the node */
    parentEditor: LexicalEditor
    /** The Lexical node that is being edited */
    codeBlockNode: CodeBlockNode
  } & CodeBlockEditorProps
> = (props) => {
  const [isNodeSelected, setNodeSelected, clearNodeSelection] =
    useLexicalNodeSelection(props.nodeKey)

  React.useEffect(() => {
    return mergeRegister(
      props.parentEditor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const cmElem = props.parentEditor.getElementByKey(props.nodeKey)

          // the event target references a specific line in the code block
          // so we need to check if the element contains the target
          // instead of being equal to the target
          if (cmElem && cmElem.contains(event.target as Node)) {
            if (!event.shiftKey) {
              clearNodeSelection()
            }
            // this creates a NodeSelection in the editor
            // without this, decorator nodes don't always create selections
            setNodeSelected(!isNodeSelected)
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [
    clearNodeSelection,
    props.parentEditor,
    setNodeSelected,
    props.nodeKey,
    setNodeSelected,
  ])

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
        codeBlockNode={props.codeBlockNode}
      />
    </CodeBlockEditorContextProvider>
  )
}

/**
 * Creates a CodeBlockNode.
 */
export function $createCodeBlockNode(
  options: Partial<CreateCodeBlockNodeOptions>
): CodeBlockNode {
  const language = (options.language ?? "") as CodeMirrorLanguage
  return $applyNodeReplacement(
    new CodeBlockNode(
      options.code ?? "",
      language,
      options.meta ?? "",
      options.src ?? "",
      options.block ?? {
        kind: "code",
        name: { kind: "anonymous", value: "anonymous" },
        startByte: 0,
        endByte: options.code?.length ?? 0,
        text: options.code ?? "",
        startLine: 1,
      }
    )
  )
}

/**
 * Returns true if the given node is a CodeBlockNode.
 */
export function $isCodeBlockNode(
  node: LexicalNode | null | undefined
): node is CodeBlockNode {
  return node instanceof CodeBlockNode
}

/**
 * Converts a <pre> HTML element into a CodeBlockNode.
 */
export function $convertPreElement(element: Element): DOMConversionOutput {
  const preElement = element as HTMLPreElement
  const code = preElement.textContent ?? ""
  // Get language from class if available (e.g., class="language-javascript")
  const classAttribute = element.getAttribute("class") ?? ""
  const dataLanguageAttribute = element.getAttribute("data-language") ?? ""
  const languageMatch = classAttribute.match(/language-(\w+)/)
  const language = languageMatch ? languageMatch[1] : dataLanguageAttribute
  const meta = preElement.getAttribute("data-meta") ?? ""
  const src = preElement.getAttribute("data-src") ?? ""
  return {
    node: $createCodeBlockNode({ code, language, meta, src }),
  }
}
