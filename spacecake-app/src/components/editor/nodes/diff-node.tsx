import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import {
  $applyNodeReplacement,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"
import React, { JSX } from "react"

import { DiffBlock } from "@/components/diff-block"

/**
 * the options necessary to construct a new diff block node.
 */
export interface CreateDiffBlockNodeOptions {
  oldContent: string
  newContent: string
  language: string
  filePath: string
}

/**
 * a serialized representation of a DiffBlockNode.
 */
export type SerializedDiffBlockNode = Spread<
  CreateDiffBlockNodeOptions & { type: "diffblock"; version: 1 },
  SerializedLexicalNode
>

/**
 * a lexical node that represents a diff view between two versions of a file.
 */
export class DiffBlockNode extends DecoratorNode<JSX.Element> {
  __oldContent: string
  __newContent: string
  __language: string
  __filePath: string

  static getType(): string {
    return "diffblock"
  }

  static clone(node: DiffBlockNode): DiffBlockNode {
    return new DiffBlockNode(
      node.__oldContent,
      node.__newContent,
      node.__language,
      node.__filePath,
      node.__key,
    )
  }

  static importJSON(serializedNode: SerializedDiffBlockNode): DiffBlockNode {
    const { oldContent, newContent, language, filePath } = serializedNode
    return $createDiffBlockNode({
      oldContent,
      newContent,
      language,
      filePath,
    })
  }

  constructor(
    oldContent: string,
    newContent: string,
    language: string,
    filePath: string,
    key?: NodeKey,
  ) {
    super(key)
    this.__oldContent = oldContent
    this.__newContent = newContent
    this.__language = language
    this.__filePath = filePath
  }

  exportJSON(): SerializedDiffBlockNode {
    return {
      ...super.exportJSON(),
      oldContent: this.__oldContent,
      newContent: this.__newContent,
      language: this.__language,
      filePath: this.__filePath,
      type: "diffblock",
      version: 1,
    }
  }

  createDOM(): HTMLDivElement {
    const div = document.createElement("div")
    div.className = "mt-2"
    return div
  }

  updateDOM(): false {
    return false
  }

  getOldContent(): string {
    return this.__oldContent
  }

  getNewContent(): string {
    return this.__newContent
  }

  getLanguage(): string {
    return this.__language
  }

  getFilePath(): string {
    return this.__filePath
  }

  // diff view is read-only, so getTextContent returns empty
  getTextContent(): string {
    return ""
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <DiffBlockEditorContainer
        parentEditor={editor}
        diffBlockNode={this}
        nodeKey={this.getKey()}
        oldContent={this.__oldContent}
        newContent={this.__newContent}
        language={this.__language}
        filePath={this.__filePath}
      />
    )
  }

  isInline(): boolean {
    return false
  }
}

interface DiffBlockEditorContainerProps {
  parentEditor: LexicalEditor
  diffBlockNode: DiffBlockNode
  nodeKey: string
  oldContent: string
  newContent: string
  language: string
  filePath: string
}

const DiffBlockEditorContainer: React.FC<DiffBlockEditorContainerProps> = ({
  parentEditor,
  nodeKey,
  oldContent,
  newContent,
  language,
  filePath,
}) => {
  const [isNodeSelected, setNodeSelected, clearNodeSelection] = useLexicalNodeSelection(nodeKey)

  React.useEffect(() => {
    return mergeRegister(
      parentEditor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const elem = parentEditor.getElementByKey(nodeKey)
          if (elem && elem.contains(event.target as Node)) {
            if (!event.shiftKey) {
              clearNodeSelection()
            }
            setNodeSelected(!isNodeSelected)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [clearNodeSelection, parentEditor, setNodeSelected, nodeKey, isNodeSelected])

  return (
    <DiffBlock
      oldContent={oldContent}
      newContent={newContent}
      language={language}
      filePath={filePath}
    />
  )
}

/**
 * creates a DiffBlockNode.
 */
export function $createDiffBlockNode(options: CreateDiffBlockNodeOptions): DiffBlockNode {
  return $applyNodeReplacement(
    new DiffBlockNode(options.oldContent, options.newContent, options.language, options.filePath),
  )
}

/**
 * returns true if the given node is a DiffBlockNode.
 */
export function $isDiffBlockNode(node: LexicalNode | null | undefined): node is DiffBlockNode {
  return node instanceof DiffBlockNode
}
