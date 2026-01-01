import React, { useEffect, useRef, useState } from "react"
import { FitAddon, init, ITheme, Terminal } from "ghostty-web"

import { isLeft } from "@/types/adt"
import {
  createTerminal,
  killTerminal,
  onTerminalOutput,
  resizeTerminal,
  writeTerminal,
} from "@/lib/terminal"
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
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null)

  const [error, setError] = useState<string | null>(null)

  const { theme } = useTheme()

  // can't currently change the terminal theme at runtime
  // so we use a ref to keep it consistent until the user reloads
  const activeTheme = useRef(
    theme === "dark" ? terminalTheme.dark : terminalTheme.light
  )

  useEffect(() => {
    const initialize = async () => {
      if (!terminalRef.current) return

      try {
        // initialize WASM
        await init()

        const term = new Terminal({
          fontSize: 14,
          fontFamily: "JetBrains Mono, monospace",
          cursorBlink: true,
          theme: activeTheme.current,
          scrollback: 10000,
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // attach to DOM
        term.open(terminalRef.current)

        // calculate initial size
        fitAddon.fit()

        // use built-in resize observation (handles ResizeObserver + window resize internally)
        fitAddon.observeResize()

        engineRef.current = term
        addonRef.current = fitAddon

        // get initial dimensions
        const cols = term.cols || 80
        const rows = term.rows || 24

        // create terminal on backend
        const result = await createTerminal(id, cols, rows)
        if (isLeft(result)) {
          console.error("failed to create terminal:", result.value)
          setError("failed to create terminal session")
          return
        }

        // listen to terminal resize events (fired by FitAddon when dimensions change)
        // debounce PTY resize to prevent vim corruption
        term.onResize(({ cols, rows }) => {
          pendingResizeRef.current = { cols, rows }

          if (resizeTimeoutRef.current !== null) {
            clearTimeout(resizeTimeoutRef.current)
          }

          resizeTimeoutRef.current = setTimeout(() => {
            if (pendingResizeRef.current) {
              // double requestAnimationFrame to ensure vim is ready
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (pendingResizeRef.current) {
                    resizeTerminal(
                      id,
                      pendingResizeRef.current.cols,
                      pendingResizeRef.current.rows
                    )
                    pendingResizeRef.current = null
                  }
                })
              })
            }
            resizeTimeoutRef.current = null
          }, 300) // 300ms debounce - enough time for vim to stabilise
        })

        // outgoing: user types in Ghostty -> send to host
        term.onData((input: string) => {
          writeTerminal(id, input)
        })

        // notify parent that terminal is ready
        if (onReady) {
          onReady({
            fit: () => fitAddon.fit(),
          })
        }
      } catch (err) {
        console.error("failed to initialize terminal:", err)
        setError(
          err instanceof Error ? err.message : "failed to initialize terminal"
        )
      }
    }

    initialize()

    return () => {
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current)
      }
      killTerminal(id)
      // nullify refs before state changes
      engineRef.current?.dispose()
      engineRef.current = null
      addonRef.current = null
      setError(null)
    }
  }, [id])

  // incoming: host sends PTY data -> write to ghostty
  useEffect(() => {
    const removeListener = onTerminalOutput((termId, data) => {
      if (termId === id && engineRef.current) {
        try {
          engineRef.current.write(data)
        } catch (err) {
          console.error("error writing to terminal:", err)
        }
      }
    })

    return () => {
      removeListener()
    }
  }, [id])

  return (
    <div className="relative w-full h-full pl-2 pt-2 bg-transparent">
      <div
        ref={terminalRef}
        className="w-full h-full overflow-hidden [&_textarea]:!caret-transparent [&_textarea]:!outline-none"
        style={{ backgroundColor: activeTheme.current.background }}
      />
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
          {error}
        </div>
      )}
    </div>
  )
}
