import { createCommand, LexicalCommand } from "lexical"

import type { ClaudeSelection } from "@/types/claude-code"

export interface CodeMirrorSelectionPayload {
  nodeKey: string
  anchor: number
  head: number
  selectedText: string
  claudeSelection: ClaudeSelection
}

export const CODEMIRROR_SELECTION_COMMAND: LexicalCommand<CodeMirrorSelectionPayload> =
  createCommand("CODEMIRROR_SELECTION_COMMAND")
