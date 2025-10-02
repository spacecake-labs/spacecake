import { InitialConfigType } from "@lexical/react/LexicalComposer"
import { $isHeadingNode } from "@lexical/rich-text"
import {
  $getRoot,
  $isParagraphNode,
  LexicalEditor,
  SerializedEditorState,
} from "lexical"

import { FileContent } from "@/types/workspace"
import { fileTypeToCodeMirrorLanguage } from "@/lib/language-support"
import { editorConfig } from "@/components/editor/editor"
import { nodeToMdBlock } from "@/components/editor/markdown-utils"
import {
  $createCodeBlockNode,
  $isCodeBlockNode,
} from "@/components/editor/nodes/code-node"
import { $isContainerNode } from "@/components/editor/nodes/container-node"
import { $isContextNode } from "@/components/editor/nodes/context-node"
import { $getDelimitedString } from "@/components/editor/nodes/delimited-node"
import { getInitialEditorStateFromContent } from "@/components/editor/read-file"

// Pure function to create editor config from serialized state
export const createEditorConfigFromState = (
  serializedState: SerializedEditorState
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: JSON.stringify(serializedState),
  }
}

// Pure function to create editor config from file content
export const createEditorConfigFromContent = (
  file: FileContent,
  viewKind?: "rich" | "source"
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: getInitialEditorStateFromContent(file, viewKind),
  }
}

// Pure function to determine editor config based on current state
export const getEditorConfig = (
  editorState: SerializedEditorState | null,
  fileContent: FileContent | null,
  selectedFilePath: string | null,
  viewKind: "rich" | "source" = "rich"
): InitialConfigType | null => {
  if (editorState) {
    return createEditorConfigFromState(editorState)
  }

  if (fileContent && selectedFilePath) {
    return createEditorConfigFromContent(fileContent, viewKind)
  }

  return null
}

/**
 * Serialize the Lexical editor contents back into a Python file string.
 * Traverses root children in order and concatenates block contents.
 * - code blocks: uses CodeBlockNode.getCode()
 * - non-code: uses text content via getTextContent()
 */
export function serializeEditorToPython(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot()
    const children = root.getChildren()

    return children.reduce((result, child) => {
      // process the node
      if ($isCodeBlockNode(child)) {
        const delimitedString = $getDelimitedString(child)
        return result + delimitedString
      }

      if ($isHeadingNode(child)) {
        const delimitedString = $getDelimitedString(child)
        return result + delimitedString
      }

      if ($isContextNode(child)) {
        const delimitedString = $getDelimitedString(child)
        return result + delimitedString
      }

      if ($isParagraphNode(child) || $isContainerNode(child)) {
        return result + nodeToMdBlock(child)
      }

      const textContent = child.getTextContent()
      return result + (textContent ? textContent + "\n" : "")
    }, "")
  })
}

/**
 * Serialize the Lexical editor contents for TypeScript/JavaScript files.
 * For source view files, just get the code from the single code block.
 */
export function serializeEditorToSource(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot()
    const children = root.getChildren()
    // For source view files, we expect a single code block
    const codeBlock = children.find((child) => $isCodeBlockNode(child))
    if (codeBlock && $isCodeBlockNode(codeBlock)) {
      return codeBlock.getCode()
    }

    // Fallback: concatenate all text content
    return children
      .reduce((result, child) => {
        const textContent = child.getTextContent()
        return result + (textContent ? textContent + "\n" : "")
      }, "")
      .trim()
  })
}

/**
 * Converts file content to a single source view (CodeMirror block)
 * This function can be used for both initial loading and live view switching
 */
export function convertToSourceView(
  content: string,
  file: FileContent,
  editor: LexicalEditor
) {
  const language = fileTypeToCodeMirrorLanguage(file.fileType)

  editor.update(() => {
    const root = $getRoot()
    root.clear()

    const codeNode = $createCodeBlockNode({
      code: content,
      language: language || undefined, // Convert null to undefined for CodeMirror
      meta: "source",
      src: file.path, // Always use file path
      block: undefined, // No block info for source view
    })

    root.append(codeNode)
  })
}
