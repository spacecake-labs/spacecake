import React, { useEffect, useRef } from "react"
import { FitAddon, init, ITheme, Terminal } from "ghostty-web"

import { isLeft } from "@/types/adt"
import {
  createTerminal,
  killTerminal,
  onTerminalOutput,
  resizeTerminal,
  writeTerminal,
} from "@/lib/terminal"
import { debounce } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"

interface GhosttyTerminalProps {
  id: string
  onReady?: (api: { fit: () => void }) => void
}

const terminalTheme: Record<"light" | "dark", ITheme> = {
  light: {
    background: "#fafafa",
    foreground: "#1a1a1a",
    cursor: "#1a1a1a",
    selectionBackground: "#d0d0d0",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    cursor: "#fafafa",
    selectionBackground: "#404040",
  },
}

export const GhosttyTerminal: React.FC<GhosttyTerminalProps> = ({
  id,
  onReady,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Terminal | null>(null)
  const addonRef = useRef<FitAddon | null>(null)

  const { theme } = useTheme()

  // can't currently change the terminal theme at runtime
  // so we use a ref to keep it consistent until the user reloads
  const activeTheme = useRef(
    theme === "dark" ? terminalTheme.dark : terminalTheme.light
  )

  useEffect(() => {
    let observer: ResizeObserver | null = null
    const resizeDebouncer = debounce(() => {
      if (engineRef.current) {
        const { cols, rows } = engineRef.current
        resizeTerminal(id, cols, rows)
      }
    }, 300)

    const initialize = async () => {
      if (!terminalRef.current) return

      // Initialize WASM
      await init()

      const term = new Terminal({
        fontSize: 14,
        fontFamily: "JetBrains Mono, monospace",
        theme: activeTheme.current,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      // Attach to DOM
      term.open(terminalRef.current)

      // Calculate initial size
      fitAddon.fit()

      // Explicit ResizeObserver for better control
      observer = new ResizeObserver(() => {
        fitAddon.fit()
      })
      observer.observe(terminalRef.current)

      engineRef.current = term
      addonRef.current = fitAddon

      // Notify parent that terminal is ready
      if (onReady) {
        onReady({
          fit: () => fitAddon.fit(),
        })
      }

      // Get initial dimensions
      const cols = term.cols || 80
      const rows = term.rows || 24

      // Create terminal on backend
      const result = await createTerminal(id, cols, rows)
      if (isLeft(result)) {
        console.error("failed to create terminal:", result.value)
        return
      }

      // Handle Resize (Debounced)
      term.onResize(() => {
        resizeDebouncer.schedule()
      })

      // Outgoing: User types in Ghostty -> Send to Host
      term.onData((input: string) => {
        writeTerminal(id, input)
      })
    }

    initialize()

    return () => {
      killTerminal(id)
      engineRef.current?.dispose()
      observer?.disconnect()
      resizeDebouncer.cancel()
    }
  }, [id])

  // Incoming: Host sends PTY data -> Write to Ghostty
  useEffect(() => {
    const removeListener = onTerminalOutput((termId, data) => {
      if (termId === id && engineRef.current) {
        engineRef.current.write(data)
      }
    })

    return () => {
      removeListener()
    }
  }, [id])

  return (
    <div className="w-full h-full pl-2 pt-2 bg-transparent">
      <div
        ref={terminalRef}
        className="w-full h-full overflow-hidden"
        style={{ backgroundColor: activeTheme.current.background }}
      />
    </div>
  )
}
