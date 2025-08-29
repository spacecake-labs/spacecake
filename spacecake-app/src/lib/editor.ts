import { InitialConfigType } from "@lexical/react/LexicalComposer"
import { $isHeadingNode } from "@lexical/rich-text"
import { getDefaultStore } from "jotai"
import {
  $getRoot,
  $isParagraphNode,
  LexicalEditor,
  SerializedEditorState,
} from "lexical"

import { FileContent } from "@/types/workspace"
import { viewKindAtom } from "@/lib/atoms/atoms"
import { fileTypeToCodeMirrorLanguage } from "@/lib/language-support"
import { editorConfig } from "@/components/editor/editor"
import { nodeToMdBlock } from "@/components/editor/markdown-utils"
import {
  $createCodeBlockNode,
  $isCodeBlockNode,
} from "@/components/editor/nodes/code-node"
import { $getDelimitedString } from "@/components/editor/nodes/delimited"
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
  viewKind?: "block" | "source"
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
  selectedFilePath: string | null
): InitialConfigType | null => {
  if (editorState) {
    return createEditorConfigFromState(editorState)
  }

  if (fileContent && selectedFilePath) {
    // Get the current view preference for this file type
    const store = getDefaultStore()
    const viewKind = store.get(viewKindAtom)(fileContent.fileType)

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
      if ($isCodeBlockNode(child)) {
        const delimitedString = $getDelimitedString(child)

        return result + delimitedString
      }

      if ($isHeadingNode(child)) {
        const delimitedString = $getDelimitedString(child)

        return result + delimitedString
      }

      if ($isParagraphNode(child)) {
        return result + nodeToMdBlock(child)
      }

      const textContent = child.getTextContent()

      return result + (textContent ? textContent + "\n" : "")
    }, "")
  })
}

/**
 * Assemble a Python file by splicing updated code blocks back into the original baseline content.
 * This preserves non-code regions like the module docstring and comments exactly as-is.
 */
// baseline handling now lives in serializeEditorToPython
/**
 * Reconcile the current editor tree against a new set of parsed Python blocks.
//  */
// export function reconcilePythonBlocks(
//   editor: LexicalEditor,
//   filePath: FileTreeItem["path"],
//   newBlocks: PyBlock[]
// ): void {
//   editor.update(() => {
//     const root = $getRoot()
//     root.clear()

//     // process all blocks in order
//     for (
//       let reconciledBlockCount = 0;
//       reconciledBlockCount < newBlocks.length;
//       reconciledBlockCount++
//     ) {
//       const block = newBlocks[reconciledBlockCount]

//       // If module docstring
//       if (reconciledBlockCount === 0 && block.kind === "doc") {
//         const delimitedString = delimitPythonDocString(block.text)
//         // Create DelimitedNode instead of converting to markdown
//         const moduleDocNode = delimitedNode(
//           (text: string) =>
//             $createHeadingNode("h2").append($createTextNode(text)),
//           delimitedString
//         )
//         root.append(moduleDocNode)
//       } else {
//         const delimitedString = delimitWithSpaceConsumer(block.text)
//         const codeNode = delimitedNode(
//           (text: string) =>
//             $createCodeBlockNode({
//               code: text,
//               language: "python",
//               meta: String(block.kind),
//               src: filePath,
//               block: block,
//             }),
//           delimitedString
//         )
//         root.append(codeNode)
//       }
//     }
//   })
// }

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
