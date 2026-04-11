import type { EditorState, Text } from "@codemirror/state"

import { type ClaudeSelection } from "@/types/claude-code"
import { type LspSelection } from "@/types/lsp"

/**
 * Result of extracting selection info from CodeMirror state.
 * Contains both the selected text and the ClaudeSelection format.
 */
export interface CodeMirrorSelectionInfo {
  selectedText: string
  claudeSelection: ClaudeSelection
}

/**
 * Extract selection info from CodeMirror EditorState for sending to Claude.
 * This is the same logic used in production in codemirror-editor.tsx.
 *
 * @param state - CodeMirror EditorState
 * @param anchor - Selection anchor position (can be before or after head)
 * @param head - Selection head position (can be before or after anchor)
 * @returns Selected text and ClaudeSelection with 0-based line numbers
 */
export const extractCodeMirrorSelectionInfo = (
  state: EditorState,
  anchor: number,
  head: number,
): CodeMirrorSelectionInfo => {
  const from = Math.min(anchor, head)
  const to = Math.max(anchor, head)
  const selectedText = state.sliceDoc(from, to)

  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const claudeSelection = createSourceViewClaudeSelection({
    startLineNumber: startLine.number,
    startLineStartOffset: startLine.from,
    endLineNumber: endLine.number,
    endLineStartOffset: endLine.from,
    selectionFrom: from,
    selectionTo: to,
  })

  return { selectedText, claudeSelection }
}

/**
 * Pure function to create a ClaudeSelection for Rich View.
 * Since Rich View doesn't map 1:1 to source lines, we treat it as a single block
 * from (0, 0) to (0, length).
 */
export const createRichViewClaudeSelection = (text: string): ClaudeSelection => {
  const length = text.length
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: length },
    isEmpty: !text || length === 0,
  }
}

/**
 * Pure function to create a ClaudeSelection for Source View (CodeMirror).
 * Handles the conversion from CodeMirror's 1-based line numbers to 0-based.
 */
/**
 * convert CM6 anchor/head offsets to an LspSelection (0-based line/character).
 */
export const cmSelectionToLsp = (
  state: EditorState,
  anchor: number,
  head: number,
): LspSelection => {
  const anchorLine = state.doc.lineAt(anchor)
  const headLine = state.doc.lineAt(head)
  return {
    _tag: "Lsp",
    anchor: { line: anchorLine.number - 1, character: anchor - anchorLine.from },
    head: { line: headLine.number - 1, character: head - headLine.from },
  }
}

/**
 * convert an LspSelection back to CM6 anchor/head offsets.
 * clamps to document bounds so stale selections don't crash.
 */
export const lspSelectionToCm = (
  doc: Text,
  sel: LspSelection,
): { anchor: number; head: number } => {
  const clampLine = (line: number) => Math.max(1, Math.min(line, doc.lines))
  const anchorLine = doc.line(clampLine(sel.anchor.line + 1))
  const headLine = doc.line(clampLine(sel.head.line + 1))
  return {
    anchor: Math.min(anchorLine.from + sel.anchor.character, anchorLine.to),
    head: Math.min(headLine.from + sel.head.character, headLine.to),
  }
}

export const createSourceViewClaudeSelection = (params: {
  startLineNumber: number // 1-based
  startLineStartOffset: number
  endLineNumber: number // 1-based
  endLineStartOffset: number
  selectionFrom: number
  selectionTo: number
}): ClaudeSelection => {
  const {
    startLineNumber,
    startLineStartOffset,
    endLineNumber,
    endLineStartOffset,
    selectionFrom,
    selectionTo,
  } = params

  return {
    start: {
      line: startLineNumber - 1,
      character: selectionFrom - startLineStartOffset,
    },
    end: {
      line: endLineNumber - 1,
      character: selectionTo - endLineStartOffset,
    },
    isEmpty: selectionFrom === selectionTo,
  }
}
