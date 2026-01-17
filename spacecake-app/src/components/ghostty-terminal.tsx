import React, { useEffect, useRef, useState } from "react"
import { Effect } from "effect"
import { FitAddon, init, ITheme, Terminal } from "ghostty-web"
import { useAtom } from "jotai"

import { isLeft } from "@/types/adt"
import { terminalProfileLoadedAtom } from "@/lib/atoms/atoms"
import { handleImagePaste, TerminalClipboardLive } from "@/lib/clipboard"
import { suppressDuplicateWarnings } from "@/lib/suppress-duplicate-warnings"
import {
  createTerminal,
  killTerminal,
  onTerminalOutput,
  resizeTerminal,
  writeTerminal,
} from "@/lib/terminal"
import { useTheme } from "@/components/theme-provider"

export interface TerminalAPI {
  fit: () => void
  getLine: (y: number) => string | null
  getAllLines: () => string[]
  rows: number
  cols: number
}

interface GhosttyTerminalProps {
  id: string
  onReady?: (api: TerminalAPI) => void
  autoFocus?: boolean
  cwd?: string
}

const terminalTheme: Record<"light" | "dark", ITheme> = {
  light: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    cursor: "#0a0a0a",
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
  autoFocus = false,
  cwd,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Terminal | null>(null)
  const addonRef = useRef<FitAddon | null>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [profileLoaded, setTerminalProfileLoaded] = useAtom(
    terminalProfileLoadedAtom
  )

  const { theme } = useTheme()

  // can't currently change the terminal theme at runtime
  // so we use a ref to keep it consistent until the user reloads
  const activeTheme = useRef(
    theme === "dark" ? terminalTheme.dark : terminalTheme.light
  )

  useEffect(() => {
    // Suppress duplicate ghostty-vt warnings (first occurrence still logs)
    const restoreWarnings = suppressDuplicateWarnings(/\[ghostty-vt\]/)

    const initialize = async () => {
      if (!terminalRef.current) return

      try {
        // initialize WASM
        await init()

        const term = new Terminal({
          fontSize: 14,
          fontFamily: "JetBrains Mono, monospace",
          cursorBlink: false,
          theme: activeTheme.current,
          scrollback: 10000,
        })

        // HACK: Prevent the terminal from ever showing the scrollbar. This is
        // to work around a bug where the terminal does not resize correctly
        // after the scrollbar disappears.
        // @ts-expect-error This is a private API
        term.showScrollbar = () => {}

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // HACK: Override proposeDimensions to not reserve 15px for scrollbar.
        // The original implementation subtracts a hardcoded 15px scrollbar width
        // which creates uneven padding since we've disabled the scrollbar.
        const originalProposeDimensions =
          fitAddon.proposeDimensions.bind(fitAddon)
        fitAddon.proposeDimensions = () => {
          const dimensions = originalProposeDimensions()
          if (!dimensions) return dimensions

          const renderer = term.renderer
          if (!renderer || typeof renderer.getMetrics !== "function") {
            return dimensions
          }

          const metrics = renderer.getMetrics()
          if (!metrics || metrics.width === 0) return dimensions

          // Add back the 15px that was subtracted for scrollbar, then recalculate cols
          const element = terminalRef.current
          if (!element) return dimensions

          const style = window.getComputedStyle(element)
          const paddingLeft = Number.parseInt(style.paddingLeft) || 0
          const paddingRight = Number.parseInt(style.paddingRight) || 0
          const availableWidth =
            element.clientWidth - paddingLeft - paddingRight
          const cols = Math.max(2, Math.floor(availableWidth / metrics.width))

          return { cols, rows: dimensions.rows }
        }

        // attach to DOM
        // HACK: ghostty-web automatically calls focus() at the end of open().
        // If autoFocus is false, we temporarily override the focus method to a no-op
        // during open() to prevent it from stealing focus from the rest of the app.
        if (!autoFocus) {
          const originalFocus = term.focus.bind(term)
          term.focus = () => {}
          term.open(terminalRef.current)
          term.focus = originalFocus
        } else {
          term.open(terminalRef.current)
        }

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
        const result = await createTerminal(id, cols, rows, cwd)
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

        // Handle special key combinations that ghostty-web doesn't fully support.
        // Return true = prevent default (we handled it), false = allow normal handling
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if (event.type !== "keydown") return false

          // Ctrl+V → image paste (ghostty-web doesn't support image paste)
          // On macOS, Cmd+V handles text paste, Ctrl+V is specifically for images in Claude Code
          if (
            event.key === "v" &&
            event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            event.preventDefault()
            Effect.runPromise(
              handleImagePaste(id).pipe(Effect.provide(TerminalClipboardLive))
            )
            return true
          }

          // Shift+Tab → legacy backtab sequence
          if (
            event.key === "Tab" &&
            event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            writeTerminal(id, "\x1b[Z")
            event.preventDefault()
            return true
          }

          // Shift+Enter → Kitty protocol format: CSI keycode ; modifier u
          if (
            event.key === "Enter" &&
            event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            writeTerminal(id, "\x1b[13;2u")
            event.preventDefault()
            return true
          }

          return false
        })

        // notify parent that terminal is ready
        const api: TerminalAPI = {
          fit: () => fitAddon.fit(),
          getLine: (y: number) =>
            term.buffer.active.getLine(y)?.translateToString(true) ?? null,
          getAllLines: () => {
            const lines: string[] = []
            for (let y = 0; y < term.rows; y++) {
              lines.push(
                term.buffer.active.getLine(y)?.translateToString(true) ?? ""
              )
            }
            return lines
          },
          get rows() {
            return term.rows
          },
          get cols() {
            return term.cols
          },
        }

        if (onReady) {
          onReady(api)
        }

        // expose for programmatic access (e.g. playwright)
        window.__terminalAPI = api
      } catch (err) {
        console.error("failed to initialize terminal:", err)
        setError(
          err instanceof Error ? err.message : "failed to initialize terminal"
        )
      }
    }

    initialize()

    return () => {
      restoreWarnings()
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current)
      }
      killTerminal(id)
      delete window.__terminalAPI
      // nullify refs before state changes
      if (engineRef.current) {
        // clear the terminal buffer, otherwise it briefly shows the previous terminal state
        engineRef.current.clear()
        engineRef.current.dispose()
        engineRef.current = null
      }
      setTerminalProfileLoaded(false)
      setError(null)
    }
  }, [id])

  // incoming: host sends PTY data -> write to ghostty
  useEffect(() => {
    const removeListener = onTerminalOutput((termId, data) => {
      if (termId === id && engineRef.current) {
        try {
          engineRef.current.write(data)

          // assume shell profile loaded if $, %, >, or # is present.
          // this makes the 'ready' indicator reliable enough for e2e tests
          // but is not reliable more broadly.
          if (!profileLoaded && /[$%>#]*$/.test(data)) {
            setTerminalProfileLoaded(true)
          }
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
    <div
      className="relative w-full h-full"
      style={{ backgroundColor: activeTheme.current.background }}
    >
      <div
        data-testid="ghostty-terminal"
        ref={terminalRef}
        // p-4 on the terminal container and box-border to ensure padding is included
        // in the element's total width and height, which is what FitAddon measures.
        className="w-full h-full overflow-hidden p-4 box-border [&_textarea]:caret-transparent! [&_textarea]:outline-none! [&_canvas]:mx-auto"
      />
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
          {error}
        </div>
      )}
    </div>
  )
}
