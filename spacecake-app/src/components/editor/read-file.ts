import { $convertFromMarkdownString } from "@lexical/markdown"
import {
  $addUpdateTag,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  LexicalEditor,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"
import { toast } from "sonner"

import { INITIAL_LOAD_TAG } from "@/types/lexical"
import type { PyBlock } from "@/types/parser"
import { EditorFile, FileType } from "@/types/workspace"
import { convertToSourceView } from "@/lib/editor"
import { parsePythonContentStreaming } from "@/lib/parser/python/blocks"
import { delimitPyBlock } from "@/components/editor/block-utils"
import { mdBlockToNode } from "@/components/editor/markdown-utils"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

/**
 * Converts Python blocks into Lexical nodes with progressive rendering
 */
export async function convertPythonBlocksToLexical(
  file: EditorFile,
  editor: LexicalEditor,
  streamParser: (
    file: EditorFile
  ) => AsyncGenerator<PyBlock> = parsePythonContentStreaming,
  onComplete?: () => void
) {
  try {
    // Start with an empty editor
    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const root = $getRoot()
      root.clear()
    })
    // Parse blocks progressively, updating per block
    let parsedBlockCount = 0
    for await (const block of streamParser(file)) {
      editor.update(
        () => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const root = $getRoot()

          if (
            block.kind === "markdown inline" ||
            block.kind === "markdown block"
          ) {
            root.append(mdBlockToNode(block))
          } else {
            const delimitedNode = delimitPyBlock(block, file.path)
            root.append(delimitedNode)
          }

          const emptyParagraph = $createParagraphNode()
          root.append(emptyParagraph)
        },
        { tag: INITIAL_LOAD_TAG }
      )
      parsedBlockCount++
    }

    // If no blocks were parsed, fall back to plaintext
    if (parsedBlockCount === 0) {
      editor.update(() => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(file.content))
        root.append(paragraph)
      })
    }

    onComplete?.()
  } catch {
    toast("failed to parse python file")
    // Fallback to plaintext
    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode(file.content))
      root.append(paragraph)
    })

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
  onComplete?: () => void
) {
  return (editor: LexicalEditor) => {
    // If viewKind is explicitly provided, use it
    if (viewKind === "source") {
      convertToSourceView(file.content, file, editor)
      return
    }

    // Default behavior based on file type
    if (file.fileType === FileType.Python) {
      // Python defaults to rich view if no view specified
      convertPythonBlocksToLexical(file, editor, undefined, onComplete)
    } else if (file.fileType === FileType.Markdown) {
      // Markdown defaults to rich view (rendered markdown) when viewKind is "rich" or undefined
      editor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        if (file.content.trim()) {
          $convertFromMarkdownString(file.content, MARKDOWN_TRANSFORMERS)
        } else {
          // Empty markdown file - create empty paragraph
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          root.append(paragraph)
        }
      })
    } else if (file.fileType === FileType.Plaintext) {
      // Plaintext files go to plaintext view
      editor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        if (file.content.trim()) {
          paragraph.append($createTextNode(file.content))
        }
        root.append(paragraph)
      })
    } else {
      // All other programming languages (JS, TS, JSX, TSX) go to source view
      convertToSourceView(file.content, file, editor)
    }
  }
}
