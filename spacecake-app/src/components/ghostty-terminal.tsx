import React, { useEffect, useRef } from "react"
import { FitAddon, init, Terminal } from "ghostty-web"

import { isLeft } from "@/types/adt"
import {
  createTerminal,
  killTerminal,
  onTerminalOutput,
  resizeTerminal,
  writeTerminal,
} from "@/lib/terminal"

interface GhosttyTerminalProps {
  id: string
  onReady?: (api: { fit: () => void }) => void
}

export const GhosttyTerminal: React.FC<GhosttyTerminalProps> = ({
  id,
  onReady,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Terminal | null>(null)
  const addonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const initialize = async () => {
      if (!terminalRef.current) return

      // Initialize WASM
      await init()

      const term = new Terminal({
        fontSize: 14,
        fontFamily: "JetBrains Mono, monospace",
        // cursorBlink: true,
        theme: {
          background: "#0a0a0a",
          foreground: "#ffffff",
        },
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      // Attach to DOM
      term.open(terminalRef.current)

      // Calculate initial size
      fitAddon.fit()

      // Auto-resize
      fitAddon.observeResize()

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

      // Handle Resize
      term.onResize((size: { cols: number; rows: number }) => {
        resizeTerminal(id, size.cols, size.rows)
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
    <div
      ref={terminalRef}
      className="w-full h-full bg-[#0a0a0a] overflow-hidden pl-2 pt-2"
    />
  )
}
