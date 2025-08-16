import { LexicalNode, NodeKey, Spread, EditorConfig } from "lexical";
import { HeadingNode, SerializedHeadingNode } from "@lexical/rich-text";
import type { DelimitedString } from "@/types/parser";
import { HeadingTagType } from "@lexical/rich-text";

export interface CreateDelimitedNodeOptions {
  delimitedString: DelimitedString;
  level: number; // Heading level (1-6)
}

export type SerializedDelimitedNode = Spread<
  CreateDelimitedNodeOptions & { type: "delimited"; version: 1 },
  SerializedHeadingNode // Extend SerializedHeadingNode instead of SerializedLexicalNode
>;

export class DelimitedNode extends HeadingNode {
  __delimitedString: DelimitedString;

  static getType(): string {
    return "delimited";
  }

  static clone(node: DelimitedNode): DelimitedNode {
    return new DelimitedNode(node.__delimitedString, node.__tag, node.__key);
  }

  static importJSON(serializedNode: SerializedDelimitedNode): DelimitedNode {
    return new DelimitedNode(
      serializedNode.delimitedString,
      `h${serializedNode.level}` as HeadingTagType
    );
  }

  constructor(
    delimitedString: DelimitedString,
    tag: HeadingTagType = "h2",
    key?: NodeKey
  ) {
    super(tag, key);
    this.__delimitedString = delimitedString;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.textContent = this.__delimitedString.between;
    return element;
  }

  updateDOM(
    prevNode: DelimitedNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    const isUpdated = super.updateDOM(prevNode as this, dom, config);
    if (prevNode.__delimitedString.between !== this.__delimitedString.between) {
      dom.textContent = this.__delimitedString.between;
      return true;
    }
    return isUpdated;
  }

  // Perfect round-trip serialization
  getSourceText(): string {
    const { prefix, between, suffix } = this.__delimitedString;
    return `${prefix}${between}${suffix}`;
  }

  // Getter for accessing the delimiter data
  getDelimitedString(): DelimitedString {
    return this.__delimitedString;
  }

  exportJSON(): SerializedDelimitedNode {
    return {
      ...super.exportJSON(),
      type: "delimited",
      delimitedString: this.__delimitedString,
      level: parseInt(this.getTag().slice(1)), // Extract level from "h2", "h3", etc.
      version: 1,
    };
  }
}

export function $createDelimitedNode(
  options: CreateDelimitedNodeOptions
): DelimitedNode {
  const tag = `h${options.level}` as HeadingTagType;
  return new DelimitedNode(options.delimitedString, tag);
}

export function $isDelimitedNode(
  node: LexicalNode | null | undefined
): node is DelimitedNode {
  return node instanceof DelimitedNode;
}
