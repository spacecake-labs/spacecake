import React, { createContext, useContext, useRef } from "react"
import type { LexicalEditor } from "lexical"

interface RouteContextType {
  editorRef: React.RefObject<LexicalEditor | null>
}

const RouteContext = createContext<RouteContextType | null>(null)

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const editorRef = useRef<LexicalEditor | null>(null)

  return (
    <RouteContext.Provider value={{ editorRef }}>
      {children}
    </RouteContext.Provider>
  )
}

export function useEditor() {
  const context = useContext(RouteContext)
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider")
  }
  return context
}
