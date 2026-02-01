import { Effect } from "effect"
import { FitAddon, init, ITheme, Terminal } from "ghostty-web"
import { useAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"

import { useTheme } from "@/components/theme-provider"
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
import { isLeft } from "@/types/adt"

export interface TerminalAPI {
  fit: () => void
  getLine: (y: number) => string | null
  getAllLines: () => string[]
  rows: number
  cols: number
}

interface UseGhosttyEngineOptions {
  id: string
  enabled: boolean
  autoFocus?: boolean
  cwd?: string
}

interface UseGhosttyEngineResult {
  containerEl: HTMLDivElement | null
  api: TerminalAPI | null
  error: string | null
  fit: () => void
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

export function useGhosttyEngine({
  id,
  enabled,
  autoFocus = false,
  cwd,
}: UseGhosttyEngineOptions): UseGhosttyEngineResult {
  // Persistent container div — survives across mount/unmount of the mount point
  const [containerEl] = useState<HTMLDivElement>(() => {
    const el = document.createElement("div")
    el.className =
      "w-full h-full overflow-hidden [&_textarea]:caret-transparent! [&_textarea]:outline-none! [&_canvas]:mx-auto"
    return el
  })

  const engineRef = useRef<Terminal | null>(null)
  const addonRef = useRef<FitAddon | null>(null)
  const apiRef = useRef<TerminalAPI | null>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const appShortcutHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const linkTooltipRef = useRef<HTMLDivElement | null>(null)
  const linkHoverHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [api, setApi] = useState<TerminalAPI | null>(null)
  const [profileLoaded, setTerminalProfileLoaded] = useAtom(terminalProfileLoadedAtom)

  const { theme } = useTheme()
  const activeTheme = useRef(theme === "dark" ? terminalTheme.dark : terminalTheme.light)

  // Initialization effect — runs when enabled becomes true, cleans up when false
  useEffect(() => {
    if (!enabled) return

    const restoreWarnings = suppressDuplicateWarnings(/\[ghostty-vt\]/)
    let isMounted = true

    const initialize = async () => {
      try {
        await init()

        if (!isMounted) return

        const term = new Terminal({
          fontSize: 13,
          fontFamily: "JetBrains Mono, monospace",
          cursorBlink: false,
          theme: activeTheme.current,
          scrollback: 10000,
        })

        // HACK: Prevent the terminal from ever showing the scrollbar.
        // @ts-expect-error This is a private API
        term.showScrollbar = () => {}

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // Attach to DOM (the persistent container div)
        if (!autoFocus) {
          const originalFocus = term.focus.bind(term)
          term.focus = () => {}
          term.open(containerEl)
          term.focus = originalFocus
        } else {
          term.open(containerEl)
        }

        // Initial fit — will use default 80x24 if container is not mounted yet
        fitAddon.fit()

        // Use built-in resize observation (handles ResizeObserver + window resize internally)
        fitAddon.observeResize()

        engineRef.current = term
        addonRef.current = fitAddon

        // Get initial dimensions (defaults if container not yet in DOM)
        const cols = term.cols || 80
        const rows = term.rows || 24

        // Create terminal on backend
        const result = await createTerminal(id, cols, rows, cwd)
        if (isLeft(result)) {
          console.error("failed to create terminal:", result.value)
          setError("failed to create terminal session")
          return
        }

        if (!isMounted) {
          killTerminal(id)
          return
        }

        // Debounce PTY resize to prevent vim corruption
        term.onResize(({ cols, rows }) => {
          pendingResizeRef.current = { cols, rows }

          if (resizeTimeoutRef.current !== null) {
            clearTimeout(resizeTimeoutRef.current)
          }

          resizeTimeoutRef.current = setTimeout(() => {
            if (pendingResizeRef.current) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (pendingResizeRef.current) {
                    resizeTerminal(id, pendingResizeRef.current.cols, pendingResizeRef.current.rows)
                    pendingResizeRef.current = null
                  }
                })
              })
            }
            resizeTimeoutRef.current = null
          }, 300)
        })

        // Outgoing: user types in Ghostty -> send to host
        term.onData((input: string) => {
          writeTerminal(id, input)
        })

        // Handle special key combinations
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if (event.type !== "keydown") return false

          // Ctrl+V → image paste
          if (
            event.key === "v" &&
            event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            event.preventDefault()
            Effect.runPromise(handleImagePaste(id).pipe(Effect.provide(TerminalClipboardLive)))
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

          // Shift+Enter → Kitty protocol format
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

          // Cmd+Backspace → delete to beginning of line (Ctrl+U)
          if (
            event.key === "Backspace" &&
            event.metaKey &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            writeTerminal(id, "\x15")
            event.preventDefault()
            return true
          }

          return false
        })

        // Intercept app shortcuts BEFORE they reach Ghostty's internal handlers
        appShortcutHandlerRef.current = (event: KeyboardEvent) => {
          const isMod = event.metaKey || event.ctrlKey
          if (isMod && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase()
            const appShortcuts = ["p", "n", "s", "1"]
            // Ctrl+` for terminal toggle - check separately
            const isBackquote = event.ctrlKey && event.code === "Backquote"
            if (appShortcuts.includes(key) || isBackquote) {
              event.stopPropagation()
              const clone = new KeyboardEvent("keydown", {
                key: event.key,
                code: event.code,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                bubbles: true,
                cancelable: true,
              })
              // Dispatch to window so capture-phase listeners receive it
              window.dispatchEvent(clone)
            }
          }
        }
        containerEl.addEventListener("keydown", appShortcutHandlerRef.current, true)

        // Create link hover tooltip
        const tooltip = document.createElement("div")
        tooltip.className =
          "fixed pointer-events-none px-2 py-1 text-xs rounded bg-popover text-popover-foreground border shadow-md opacity-0 transition-opacity duration-150 z-50"
        tooltip.textContent = "follow link (⌘ + click)"
        document.body.appendChild(tooltip)
        linkTooltipRef.current = tooltip

        // Show tooltip when hovering over links
        linkHoverHandlerRef.current = (e: MouseEvent) => {
          const target = e.target as HTMLElement
          // Check if cursor is pointer (ghostty-web sets this when over a link)
          const isOverLink =
            target.style.cursor === "pointer" ||
            window.getComputedStyle(target).cursor === "pointer"

          if (isOverLink) {
            tooltip.style.left = `${e.clientX + 12}px`
            tooltip.style.top = `${e.clientY + 12}px`
            tooltip.style.opacity = "1"
          } else {
            tooltip.style.opacity = "0"
          }
        }
        containerEl.addEventListener("mousemove", linkHoverHandlerRef.current)
        containerEl.addEventListener("mouseleave", () => {
          tooltip.style.opacity = "0"
        })

        // Build API
        const terminalApi: TerminalAPI = {
          fit: () => fitAddon.fit(),
          getLine: (y: number) => term.buffer.active.getLine(y)?.translateToString(true) ?? null,
          getAllLines: () => {
            const lines: string[] = []
            for (let y = 0; y < term.rows; y++) {
              lines.push(term.buffer.active.getLine(y)?.translateToString(true) ?? "")
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

        apiRef.current = terminalApi
        setApi(terminalApi)
        window.__terminalAPI = terminalApi
      } catch (err) {
        console.error("failed to initialize terminal:", err)
        setError(err instanceof Error ? err.message : "failed to initialize terminal")
      }
    }

    initialize()

    return () => {
      isMounted = false
      restoreWarnings()
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current)
      }
      if (appShortcutHandlerRef.current) {
        containerEl.removeEventListener("keydown", appShortcutHandlerRef.current, true)
        appShortcutHandlerRef.current = null
      }
      if (linkHoverHandlerRef.current) {
        containerEl.removeEventListener("mousemove", linkHoverHandlerRef.current)
        linkHoverHandlerRef.current = null
      }
      if (linkTooltipRef.current) {
        linkTooltipRef.current.remove()
        linkTooltipRef.current = null
      }
      killTerminal(id)
      delete window.__terminalAPI
      if (engineRef.current) {
        engineRef.current.clear()
        engineRef.current.dispose()
        engineRef.current = null
      }
      addonRef.current = null
      apiRef.current = null
      setApi(null)
      setTerminalProfileLoaded(false)
      setError(null)
    }
  }, [id, enabled])

  // Incoming: host sends PTY data -> write to ghostty
  useEffect(() => {
    if (!enabled) return

    const removeListener = onTerminalOutput((termId, data) => {
      if (termId === id && engineRef.current) {
        try {
          engineRef.current.write(data)

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
  }, [id, enabled])

  // Stable fit callback
  const fit = useCallback(() => {
    addonRef.current?.fit()
  }, [])

  return {
    containerEl: enabled ? containerEl : null,
    api,
    error,
    fit,
  }
}
