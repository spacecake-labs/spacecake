import { useEffect, useRef } from "react"

import type { MenuAction } from "@/types/electron"

// --- singleton manager ---

class MenuActionManager {
  private listeners = new Map<MenuAction, React.RefObject<(() => void) | null>>()
  private cleanup: (() => void) | null = null

  register(action: MenuAction, callbackRef: React.RefObject<(() => void) | null>): () => void {
    this.listeners.set(action, callbackRef)
    this.ensureListener()

    return () => {
      // only remove if the ref is still the one we registered
      if (this.listeners.get(action) === callbackRef) {
        this.listeners.delete(action)
      }
      if (this.listeners.size === 0) {
        this.removeListener()
      }
    }
  }

  private ensureListener() {
    if (this.cleanup) return
    this.cleanup = window.electronAPI.onMenuAction((action) => {
      const ref = this.listeners.get(action as MenuAction)
      ref?.current?.()
    })
  }

  private removeListener() {
    this.cleanup?.()
    this.cleanup = null
  }
}

const manager = new MenuActionManager()

// --- react hook ---

export function useMenuAction(action: MenuAction, callback: () => void) {
  const callbackRef = useRef<(() => void) | null>(callback)
  callbackRef.current = callback

  useEffect(() => {
    return manager.register(action, callbackRef)
  }, [action])
}
