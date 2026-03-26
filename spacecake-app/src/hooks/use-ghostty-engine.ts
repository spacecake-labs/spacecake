import * as Effect from "effect/Effect"
import { FitAddon, Ghostty, ITheme, Terminal } from "ghostty-web"
import { useCallback, useEffect, useRef, useState } from "react"

import { useTheme } from "@/components/theme-provider"
import { useLatest } from "@/hooks/use-latest"
import { handleImagePaste, TerminalClipboardLive } from "@/lib/clipboard"
import { parseOsc7, OSC7_PREFIX } from "@/lib/osc7-parser"
import { suppressDuplicateWarnings } from "@/lib/suppress-duplicate-warnings"
import {
  createTerminal,
  hasTerminal,
  killTerminal,
  onTerminalOutput,
  replayTerminal,
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
  setCursorBlink: (enabled: boolean) => void
}

interface UseGhosttyEngineOptions {
  id: string
  surfaceId?: string
  enabled: boolean
  autoFocus?: boolean
  cwd?: string
  onTitleChange?: (title: string) => void
  onWorkingDirectoryChange?: (cwd: string) => void
  onProfileLoaded?: () => void
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

const PROMPT_PATTERN = /[$%>#]*$/

// shared link-hover tooltip — one DOM node reused by all terminal tabs
let sharedTooltip: HTMLDivElement | null = null
let tooltipRefCount = 0

function acquireTooltip(): HTMLDivElement {
  if (!sharedTooltip) {
    const el = document.createElement("div")
    el.className =
      "fixed pointer-events-none px-2 py-1 text-xs rounded bg-popover text-popover-foreground border shadow-md opacity-0 transition-opacity duration-150 z-50"
    el.textContent = "follow link (\u2318 + click)"
    document.body.appendChild(el)
    sharedTooltip = el
  }
  tooltipRefCount++
  return sharedTooltip
}

function releaseTooltip(): void {
  tooltipRefCount--
  if (tooltipRefCount <= 0) {
    sharedTooltip?.remove()
    sharedTooltip = null
    tooltipRefCount = 0
  }
}

function showTooltip(x: number, y: number): void {
  if (!sharedTooltip) return
  sharedTooltip.style.left = `${x + 12}px`
  sharedTooltip.style.top = `${y + 12}px`
  sharedTooltip.style.opacity = "1"
}

function hideTooltip(): void {
  if (!sharedTooltip) return
  sharedTooltip.style.opacity = "0"
}

export function useGhosttyEngine({
  id,
  surfaceId,
  enabled,
  autoFocus = false,
  cwd,
  onTitleChange,
  onWorkingDirectoryChange,
  onProfileLoaded,
}: UseGhosttyEngineOptions): UseGhosttyEngineResult {
  // Persistent container div - survives across mount/unmount of the mount point
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
  const linkLeaveHandlerRef = useRef<(() => void) | null>(null)
  const onTitleChangeRef = useLatest(onTitleChange)
  const onWorkingDirectoryChangeRef = useLatest(onWorkingDirectoryChange)
  const onProfileLoadedRef = useLatest(onProfileLoaded)
  const profileLoadedRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [api, setApi] = useState<TerminalAPI | null>(null)

  const { theme } = useTheme()
  const activeTheme = useRef(theme === "dark" ? terminalTheme.dark : terminalTheme.light)

  // Initialization effect - runs when enabled becomes true, cleans up when false
  useEffect(() => {
    if (!enabled) return

    const restoreWarnings = suppressDuplicateWarnings(/\[ghostty-vt\]/)
    let isMounted = true

    // detect reload/HMR: if beforeunload fires, we're reloading — skip pty kill
    let isReloading = false
    const onBeforeUnload = () => {
      isReloading = true
    }
    window.addEventListener("beforeunload", onBeforeUnload)

    const initialize = async () => {
      try {
        const ghostty = await Ghostty.load("ghostty-vt.wasm")

        if (!isMounted) return

        const term = new Terminal({
          fontSize: 13,
          fontFamily: "JetBrains Mono, monospace",
          cursorBlink: false,
          theme: activeTheme.current,
          scrollback: 10000,
          ghostty,
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

        // Initial fit - will use default 80x24 if container is not mounted yet
        fitAddon.fit()

        // Use built-in resize observation (handles ResizeObserver + window resize internally)
        fitAddon.observeResize()

        engineRef.current = term
        addonRef.current = fitAddon

        // Get initial dimensions (defaults if container not yet in DOM)
        const cols = term.cols || 80
        const rows = term.rows || 24

        // check if pty already exists in main process (survives reload)
        const alreadyExists = await hasTerminal(id)

        if (alreadyExists) {
          // reconnect: replay buffered output
          const buffer = await replayTerminal(id)
          if (buffer) term.write(buffer)
          // re-sync pty dimensions to match the new terminal instance
          resizeTerminal(id, cols, rows)
          // shell was already initialized before reload — mark profile loaded
          // (replay goes through term.write, not onTerminalOutput, so the
          // listener-based detection would never fire)
          profileLoadedRef.current = true
          onProfileLoadedRef.current?.()
        } else {
          // create new terminal on backend
          const result = await createTerminal(id, cols, rows, cwd, surfaceId)
          if (isLeft(result)) {
            console.error("failed to create terminal:", result.value)
            setError("failed to create terminal session")
            return
          }
        }

        if (!isMounted) {
          // only kill if we just created it
          if (!alreadyExists) killTerminal(id)
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
                if (pendingResizeRef.current) {
                  resizeTerminal(id, pendingResizeRef.current.cols, pendingResizeRef.current.rows)
                  pendingResizeRef.current = null
                }
              })
            }
            resizeTimeoutRef.current = null
          }, 300)
        })

        // Outgoing: user types in Ghostty -> send to host
        term.onData((input: string) => {
          writeTerminal(id, input)
        })

        // propagate OSC title changes (shell integration sets cwd / running command)
        term.onTitleChange((title: string) => {
          onTitleChangeRef.current?.(title)
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

        // shared link hover tooltip (one DOM node for all tabs)
        const tooltip = acquireTooltip()
        linkTooltipRef.current = tooltip

        linkHoverHandlerRef.current = (e: MouseEvent) => {
          const target = e.target as HTMLElement
          const isOverLink =
            target.style.cursor === "pointer" ||
            window.getComputedStyle(target).cursor === "pointer"

          if (isOverLink) {
            showTooltip(e.clientX, e.clientY)
          } else {
            hideTooltip()
          }
        }
        containerEl.addEventListener("mousemove", linkHoverHandlerRef.current)
        linkLeaveHandlerRef.current = () => {
          hideTooltip()
        }
        containerEl.addEventListener("mouseleave", linkLeaveHandlerRef.current)

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
          setCursorBlink: (enabled: boolean) => {
            term.options.cursorBlink = enabled
          },
        }

        apiRef.current = terminalApi
        setApi(terminalApi)
      } catch (err) {
        console.error("failed to initialize terminal:", err)
        setError(err instanceof Error ? err.message : "failed to initialize terminal")
      }
    }

    initialize()

    return () => {
      isMounted = false
      restoreWarnings()
      window.removeEventListener("beforeunload", onBeforeUnload)
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
      if (linkLeaveHandlerRef.current) {
        containerEl.removeEventListener("mouseleave", linkLeaveHandlerRef.current)
        linkLeaveHandlerRef.current = null
      }
      if (linkTooltipRef.current) {
        releaseTooltip()
        linkTooltipRef.current = null
      }

      // only kill the pty on explicit tab close, not on reload/HMR
      if (!isReloading) {
        killTerminal(id)
      }

      // capture and null refs synchronously so nothing else can use them
      const engine = engineRef.current
      engineRef.current = null
      addonRef.current = null
      apiRef.current = null
      setApi(null)
      setError(null)

      // defer WebGL teardown so it doesn't race with DOM layout changes
      // during panel collapse (avoids ANGLE renderer crash on Windows)
      if (engine) {
        setTimeout(() => {
          engine.clear()
          engine.dispose()
        }, 0)
      }
    }
  }, [id, enabled])

  // Incoming: host sends PTY data -> write to ghostty
  useEffect(() => {
    if (!enabled) return

    const removeListener = onTerminalOutput((termId, data) => {
      if (termId === id && engineRef.current) {
        try {
          engineRef.current.write(data)

          if (!profileLoadedRef.current && PROMPT_PATTERN.test(data)) {
            profileLoadedRef.current = true
            onProfileLoadedRef.current?.()
          }

          // Parse OSC 7 sequences to track working directory changes
          // fast prefix check avoids running the full regex on every PTY chunk
          if (onWorkingDirectoryChangeRef.current && data.includes(OSC7_PREFIX)) {
            const osc7Data = parseOsc7(data)
            if (osc7Data) {
              onWorkingDirectoryChangeRef.current(osc7Data.path)
            }
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
