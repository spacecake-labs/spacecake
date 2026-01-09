import { $getSelection, $isRangeSelection, type EditorState } from "lexical"

import { type SelectionChangedPayload } from "@/types/claude-code"

/**
 * Helper to extract selected text from Lexical editor state
 */
export const getSelectedTextFromLexical = (
  editorState: EditorState
): string => {
  let text = ""
  editorState.read(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      text = selection.getTextContent()
    }
  })
  return text
}

/**
 * Helper to construct the Claude Code selection payload
 */
export const createClaudeSelectionPayload = (params: {
  filePath: string
  viewKind?: string | null
  selectedText: string
  isEmpty: boolean
  selectionInfo?: {
    startLine?: number
    startChar?: number
    endLine?: number
    endChar?: number
  }
}): SelectionChangedPayload => {
  const { filePath, viewKind, selectedText, isEmpty, selectionInfo } = params

  // In source view, use actual line/character from CodeMirror
  // In rich view, use text-based positions since line numbers don't correspond to file
  const selection =
    viewKind === "source" && selectionInfo
      ? {
          start: {
            line: selectionInfo.startLine ?? 0,
            character: selectionInfo.startChar ?? 0,
          },
          end: {
            line: selectionInfo.endLine ?? 0,
            character: selectionInfo.endChar ?? selectedText.length,
          },
          isEmpty: isEmpty,
        }
      : {
          start: { line: 0, character: 0 },
          end: { line: 0, character: selectedText.length },
          isEmpty: isEmpty,
        }

  return {
    text: selectedText,
    filePath: filePath,
    fileUrl: `file://${filePath}`,
    selection,
  }
}
