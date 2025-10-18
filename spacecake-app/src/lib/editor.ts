import { JsonValue } from "@/schema/drizzle-effect"
import { $convertToMarkdownString } from "@lexical/markdown"
import { InitialConfigType } from "@lexical/react/LexicalComposer"
import { $isHeadingNode } from "@lexical/rich-text"
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $setSelection,
  createEditor,
  LexicalEditor,
  resetRandomKey,
  type EditorState,
} from "lexical"

import { type SerializedSelection } from "@/types/lexical"
import type { EditorFile, FileType } from "@/types/workspace"
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
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export const createEditorConfigFromState = (
  serializedState: JsonValue,
  initialSelection: SerializedSelection | null = null
): InitialConfigType => {
  if (initialSelection) {
    return {
      ...editorConfig,
      editorState: (editor: LexicalEditor) => {
        /*
        Reset the ID for the first node back to 1.
        This is a bit of a hack but is necessary for now
        to ensure that selection is restored correctly.
        Otherwise the nodeKey values don't align
        when switching files.
        */
        resetRandomKey()

        const parsedEditorState = editor.parseEditorState(
          JSON.stringify(serializedState),
          () => {
            $restoreSelection(initialSelection)
          }
        )
        editor.setEditorState(parsedEditorState)
      },
    }
  }

  return {
    ...editorConfig,
    editorState: JSON.stringify(serializedState),
  }
}

// Pure function to create editor config from file content
export const createEditorConfigFromContent = (
  file: EditorFile,
  viewKind: "rich" | "source",
  selection: SerializedSelection | null = null
): InitialConfigType => {
  return {
    ...editorConfig,
    editorState: getInitialEditorStateFromContent(file, viewKind, selection),
  }
}

// Pure function to determine editor config based on current state
export const getEditorConfig = (
  editorState: JsonValue | null,
  fileBuffer: EditorFile | null,
  viewKind: "rich" | "source" = "rich",
  initialSelection: SerializedSelection | null = null
): InitialConfigType | null => {
  if (editorState) {
    return createEditorConfigFromState(editorState, initialSelection)
  }

  if (fileBuffer) {
    return createEditorConfigFromContent(fileBuffer, viewKind)
  }

  return null
}

/**
 * Serialize the Lexical editor contents back into a Python file string.
 * Traverses root children in order and concatenates block contents.
 * - code blocks: uses CodeBlockNode.getCode()
 * - non-code: uses text content via getTextContent()
 */
export function serializeEditorToPython(editorState: EditorState): string {
  return editorState.read(() => {
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
export function serializeEditorToSource(editorState: EditorState): string {
  return editorState.read(() => {
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
  file: EditorFile,
  editor: LexicalEditor,
  selection: SerializedSelection | null = null
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

    if (selection) {
      $restoreSelection(selection)
    }
  })
}

export function serializeEditorToMarkdown(editorState: EditorState): string {
  return editorState.read(() => {
    const root = $getRoot()
    return $convertToMarkdownString(MARKDOWN_TRANSFORMERS, root, true)
  })
}

/**
 * Serialize the editor state to a string based on the file type.
 * This acts as a single entry point for serialization.
 */
export function serializeFileContent(
  editorState: EditorState,
  fileType: FileType
): string {
  if (fileType === "python") {
    return serializeEditorToPython(editorState)
  }

  if (fileType === "markdown") {
    return serializeEditorToMarkdown(editorState)
  }

  // For other file types, we assume they are source files.
  return serializeEditorToSource(editorState)
}

export function serializeFromCache(
  data: JsonValue,
  fileType: FileType
): string {
  const editor = createEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes,
    theme: editorConfig.theme,
  })
  const editorState = editor.parseEditorState(JSON.stringify(data))
  return serializeFileContent(editorState, fileType)
}

/**
 * restores a serialized selection to the editor.
 * this is useful when loading a file and wanting to restore the cursor position.
 */
export function $restoreSelection(selection: SerializedSelection | null) {
  if (!selection) {
    return
  }

  const anchorNode = $getNodeByKey(selection.anchor.key)
  const focusNode = $getNodeByKey(selection.focus.key)

  if (anchorNode && focusNode) {
    const rangeSelection = $createRangeSelection()
    rangeSelection.anchor.set(
      selection.anchor.key,
      selection.anchor.offset,
      $isElementNode(anchorNode) ? "element" : "text"
    )
    rangeSelection.focus.set(
      selection.focus.key,
      selection.focus.offset,
      $isElementNode(focusNode) ? "element" : "text"
    )
    $setSelection(rangeSelection)
  }
}
