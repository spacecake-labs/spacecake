import React, { createContext, useContext, useRef } from "react"
import type { LexicalEditor } from "lexical"

export interface CancelDebounceRef {
  current: () => void
}

interface RouteContextType {
  editorRef: React.RefObject<LexicalEditor | null>
  cancelDebounceRef: CancelDebounceRef
  cancelDebounce: () => void
}

const RouteContext = createContext<RouteContextType | null>(null)

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const editorRef = useRef<LexicalEditor | null>(null)
  const cancelDebounceRef = useRef<() => void>(() => {})

  return (
    <RouteContext.Provider
      value={{
        editorRef,
        cancelDebounceRef,
        cancelDebounce: () => cancelDebounceRef.current(),
      }}
    >
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

export { RouteContext }
