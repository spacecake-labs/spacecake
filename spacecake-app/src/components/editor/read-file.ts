import { $convertFromMarkdownString } from "@lexical/markdown"
import {
  $addUpdateTag,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  LexicalEditor,
  NodeSelection,
  resetRandomKey,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"
import { toast } from "sonner"

import { delimitPyBlock } from "@/components/editor/block-utils"
import { emptyMdNode, mdBlockToNode } from "@/components/editor/markdown-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"
import { $restoreNodeSelection, $restoreSelection, convertToSourceView } from "@/lib/editor"
import { INITIAL_LOAD_TAG, SerializedSelection } from "@/types/lexical"
import type { PyBlock } from "@/types/parser"
import { EditorFile, FileType } from "@/types/workspace"

/**
 * Converts Python blocks into Lexical nodes.
 * Parsing runs in the main process via IPC; blocks arrive as a single array.
 */
export async function convertPythonBlocksToLexical(
  file: EditorFile,
  editor: LexicalEditor,
  selection: SerializedSelection | null = null,
  nodeSelection: NodeSelection | null = null,
  blockOverride?: PyBlock[],
  onComplete?: () => void,
) {
  try {
    const blocks =
      blockOverride ?? (await window.electronAPI.parser.parseBlocks(file.content, file.path))

    // Start with an empty editor
    editor.update(
      () => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const root = $getRoot()
        root.clear()
        // nodes start again from zero
        resetRandomKey()
      },
      { tag: INITIAL_LOAD_TAG },
    )

    for (const block of blocks) {
      editor.update(
        () => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const root = $getRoot()

          if (block.kind === "markdown inline" || block.kind === "markdown block") {
            root.append(mdBlockToNode(block.text))
          } else {
            const delimitedNode = delimitPyBlock(block, file.path)
            root.append(delimitedNode)
          }

          root.append(emptyMdNode())
          if (selection) {
            $restoreSelection(selection)
          }
          if (nodeSelection) {
            $restoreNodeSelection(nodeSelection)
          }
        },
        { tag: INITIAL_LOAD_TAG },
      )
    }

    // If no blocks were parsed, fall back to plaintext
    if (blocks.length === 0) {
      editor.update(
        () => {
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode(file.content))
          root.append(paragraph)
        },
        { tag: INITIAL_LOAD_TAG },
      )
    }

    onComplete?.()
  } catch {
    toast("failed to parse python file")
    // Fallback to plaintext
    editor.update(
      () => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(file.content))
        root.append(paragraph)
      },
      { tag: INITIAL_LOAD_TAG },
    )

    onComplete?.()
  }
}

/**
 * Returns a function suitable for Lexical's editorState prop, which loads initial content
 * into the editor based on the file type and view preference.
 */
export function getInitialEditorStateFromContent(
  file: EditorFile,
  viewKind: "rich" | "source",
  selection: SerializedSelection | null = null,
  onComplete?: () => void,
) {
  return (editor: LexicalEditor) => {
    resetRandomKey()

    if (viewKind === "source") {
      convertToSourceView(file.content, file, editor)
    } else if (file.fileType === FileType.Python) {
      convertPythonBlocksToLexical(file, editor, null, null, undefined, () => {
        onComplete?.()
        if (selection) {
          editor.update(() => $restoreSelection(selection), { discrete: true })
        }
      })
      return
    } else if (file.fileType === FileType.Markdown) {
      editor.update(
        () => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          if (file.content.trim()) {
            $convertFromMarkdownString(file.content, MARKDOWN_TRANSFORMERS, undefined, true)
          } else {
            const root = $getRoot()
            root.clear()
            const paragraph = $createParagraphNode()
            root.append(paragraph)
          }
        },
        { tag: INITIAL_LOAD_TAG },
      )
    } else if (file.fileType === FileType.Plaintext) {
      editor.update(
        () => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          if (file.content.trim()) {
            paragraph.append($createTextNode(file.content))
          }
          root.append(paragraph)
        },
        { tag: INITIAL_LOAD_TAG },
      )
    } else {
      convertToSourceView(file.content, file, editor)
    }

    if (selection) {
      const removeListener = editor.registerUpdateListener(() => {
        removeListener()
        editor.update(() => $restoreSelection(selection), { discrete: true })
      })
    }
  }
}
