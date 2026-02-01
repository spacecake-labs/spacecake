import { createContext, useCallback, useContext, useEffect, useRef } from "react"

import type { PanelKind } from "@/schema/workspace-layout"

type FocusCallback = () => void
type Unregister = () => void

interface FocusManagerContextValue {
  register: (id: PanelKind, focus: FocusCallback) => Unregister
  focus: (id: PanelKind) => void
}

const FocusManagerContext = createContext<FocusManagerContextValue | null>(null)

export function FocusManagerProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef(new Map<PanelKind, FocusCallback>())

  const register = useCallback((id: PanelKind, focus: FocusCallback): Unregister => {
    registry.current.set(id, focus)
    return () => registry.current.delete(id)
  }, [])

  const focus = useCallback((id: PanelKind) => {
    registry.current.get(id)?.()
  }, [])

  return (
    <FocusManagerContext.Provider value={{ register, focus }}>
      {children}
    </FocusManagerContext.Provider>
  )
}

export function useFocusManager() {
  const ctx = useContext(FocusManagerContext)
  if (!ctx) throw new Error("useFocusManager must be used within FocusManagerProvider")
  return ctx
}

export function useFocusablePanel(id: PanelKind, focus: FocusCallback) {
  const { register } = useFocusManager()
  useEffect(() => register(id, focus), [id, focus, register])
}
