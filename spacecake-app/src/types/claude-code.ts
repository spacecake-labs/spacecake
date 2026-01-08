export interface SelectionChangedPayload {
  text: string
  filePath: string
  fileUrl?: string
  selection: {
    start: { line: number; character: number }
    end: { line: number; character: number }
    isEmpty: boolean
  }
}

export interface AtMentionedPayload {
  filePath: string
  lineStart: number
  lineEnd: number
}

export type ClaudeCodeStatus = "connected" | "connecting" | "disconnected"
