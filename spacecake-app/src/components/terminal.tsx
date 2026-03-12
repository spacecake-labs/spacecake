import { useSetAtom } from "jotai"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { TabCloseButton, tabTriggerClasses } from "@/components/tab-bar/tab-close-button"
import { TerminalTab } from "@/components/terminal-tab"
import { useTheme } from "@/components/theme-provider"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { TerminalAPI } from "@/hooks/use-ghostty-engine"
import { useHotkey } from "@/hooks/use-hotkey"
import { useLatest } from "@/hooks/use-latest"
import {
  activeTerminalSurfaceIdAtom,
  statuslineMapAtom,
  terminalProfileLoadedAtom,
} from "@/lib/atoms/atoms"
import { condensePath } from "@/lib/utils"

interface TabState {
  id: string
  label: string
  surfaceId: string
}

interface TerminalProps {
  cwd: string
  toolbarRight?: ReactNode
  onActiveApiChange?: (api: TerminalAPI | null) => void
  onLastTabClosed?: () => void
}

function makeTab(label?: string): TabState {
  const id = `terminal-tab-${crypto.randomUUID()}`
  const surfaceId = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")
  return { id, label: label ?? "\u{1F370}", surfaceId }
}

/** extract a short display name from a terminal title (path → basename, command → as-is) */
function terminalDisplayName(title: string): string {
  if (title.includes("/")) {
    const basename = title.split("/").filter(Boolean).pop()
    return basename ?? title
  }
  return title
}

export function Terminal({ cwd, toolbarRight, onActiveApiChange, onLastTabClosed }: TerminalProps) {
  const { theme } = useTheme()
  // ghostty cannot switch theme after initialization, so lock the terminal
  // panel to the theme at first render — updates on app reload
  const lockedThemeRef = useRef(theme)
  const lockedTheme = lockedThemeRef.current

  const [initialTab] = useState(() => makeTab())
  const [tabs, setTabs] = useState<TabState[]>(() => [initialTab])
  const [activeTabId, setActiveTabId] = useState<string | null>(initialTab.id)

  // track APIs per tab so we can expose the active one
  const tabApisRef = useRef<Map<string, TerminalAPI>>(new Map())

  // per-surface statusline tracking
  const setActiveSurfaceId = useSetAtom(activeTerminalSurfaceIdAtom)
  const setStatuslineMap = useSetAtom(statuslineMapAtom)

  // per-tab profile loaded tracking
  const setProfileLoaded = useSetAtom(terminalProfileLoadedAtom)
  const profileLoadedTabsRef = useRef<Set<string>>(new Set())

  // tracks a tab created by addTab that hasn't mounted yet — used to
  // auto-focus only user-created tabs, not the initial tab on startup
  const pendingNewTabRef = useRef<string | null>(null)

  // scroll refs for the tab bar
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // latest refs — avoids stale closures without re-creating callbacks
  const tabsRef = useLatest(tabs)
  const activeTabIdRef = useLatest(activeTabId)
  const onLastTabClosedRef = useLatest(onLastTabClosed)
  const onActiveApiChangeRef = useLatest(onActiveApiChange)

  // stable: reads prop from ref so it never re-creates
  const syncActiveApi = useCallback((tabId: string | null) => {
    const api = tabId ? (tabApisRef.current.get(tabId) ?? null) : null
    window.__terminalAPI = api ?? undefined
    onActiveApiChangeRef.current?.(api)
  }, [])

  // focus the terminal textarea for a given tab
  const focusTerminal = useCallback((tabId?: string) => {
    const id = tabId ?? activeTabIdRef.current
    if (!id) return
    const panel = document.querySelector('[data-testid="terminal-panel"]')
    const tabContent = panel?.querySelector(
      `[data-testid="terminal-tab-content"][data-tab-id="${id}"]`,
    )
    tabContent?.querySelector<HTMLTextAreaElement>("textarea")?.focus()
  }, [])

  // central handler for all tab activations — replaces 4 separate effects
  const activateTab = useCallback(
    (tabId: string) => {
      // flush synchronously so the target tab's display:block is committed
      // before we attempt to focus its textarea
      flushSync(() => {
        setActiveTabId(tabId)
      })
      syncActiveApi(tabId)
      setProfileLoaded(profileLoadedTabsRef.current.has(tabId))

      // set active surface so the derived statusline atom picks the right entry
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (tab) setActiveSurfaceId(tab.surfaceId)

      // immediate attempt (works for keyboard-triggered switches)
      focusTerminal(tabId)
      // deferred attempt (handles click-triggered switches where the browser
      // moves focus to the clicked button after our synchronous focus call)
      requestAnimationFrame(() => focusTerminal(tabId))

      // scroll tab button into view after paint
      requestAnimationFrame(() => {
        scrollContainerRef.current
          ?.querySelector(`[data-state="active"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
      })
    },
    [syncActiveApi, setProfileLoaded, focusTerminal, setActiveSurfaceId],
  )

  const handleTabReady = useCallback(
    (tabId: string, api: TerminalAPI) => {
      tabApisRef.current.set(tabId, api)
      if (activeTabIdRef.current === tabId) {
        syncActiveApi(tabId)
        // only auto-focus if this is a user-created tab (not the initial tab on startup)
        if (pendingNewTabRef.current === tabId) {
          pendingNewTabRef.current = null
          requestAnimationFrame(() => focusTerminal(tabId))
        }
      }
    },
    [syncActiveApi, focusTerminal],
  )

  const handleTabDispose = useCallback(
    (tabId: string) => {
      tabApisRef.current.delete(tabId)
      profileLoadedTabsRef.current.delete(tabId)
      if (activeTabIdRef.current === tabId) {
        syncActiveApi(null)
      }
    },
    [syncActiveApi],
  )

  const handleProfileLoaded = useCallback(
    (tabId: string) => {
      profileLoadedTabsRef.current.add(tabId)
      if (activeTabIdRef.current === tabId) {
        setProfileLoaded(true)
      }
    },
    [setProfileLoaded],
  )

  const handleTitleChange = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label: title } : t)))
  }, [])

  const addTab = useCallback(() => {
    const tab = makeTab()
    pendingNewTabRef.current = tab.id
    setTabs((prev) => [...prev, tab])
    activateTab(tab.id)
  }, [activateTab])

  const closeTab = useCallback(
    (tabId: string) => {
      const prev = tabsRef.current
      const closedTab = prev.find((t) => t.id === tabId)
      const idx = prev.findIndex((t) => t.id === tabId)
      const next = prev.filter((t) => t.id !== tabId)

      // clean up server-side and renderer statusline for this surface
      if (closedTab) {
        window.electronAPI.claude.clearSurface(closedTab.surfaceId)
        setStatuslineMap((map) => {
          const next = new Map(map)
          next.delete(closedTab.surfaceId)
          return next
        })
      }

      setTabs(next)

      if (activeTabIdRef.current === tabId) {
        if (next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1)
          activateTab(next[newIdx].id)
        } else {
          setActiveSurfaceId(null)
          onLastTabClosedRef.current?.()
        }
      }
    },
    [activateTab, setStatuslineMap, setActiveSurfaceId],
  )

  const switchTab = useCallback(
    (tabId: string) => {
      activateTab(tabId)
    },
    [activateTab],
  )

  // reset atom on unmount
  useEffect(() => {
    return () => setProfileLoaded(false)
  }, [setProfileLoaded])

  // handle horizontal scroll on wheel — must use native event for non-passive option
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      container.scrollLeft += e.deltaY || e.deltaX
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  // keep active tab visible on container resize
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      const activeTab = container.querySelector(`[data-state="active"]`)
      activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // keyboard shortcuts (only when terminal panel is focused)
  const terminalFocusGuard = useCallback(() => {
    const panel = document.querySelector('[data-testid="terminal-panel"]')
    return panel?.contains(document.activeElement) ?? false
  }, [])

  // Cmd+T → new tab
  useHotkey("mod+t", () => addTab(), {
    capture: true,
    stopPropagation: true,
    guard: terminalFocusGuard,
  })

  // Cmd+W → close active tab
  useHotkey(
    "mod+w",
    () => {
      const current = tabsRef.current
      const active = activeTabIdRef.current
      if (current.length > 0 && active) {
        closeTab(active)
      }
    },
    { capture: true, stopPropagation: true, guard: terminalFocusGuard },
  )

  // Ctrl+Tab → cycle tabs forward
  const cycleTab = useCallback(
    (direction: 1 | -1) => {
      const current = tabsRef.current
      if (current.length <= 1) return
      const idx = current.findIndex((t) => t.id === activeTabIdRef.current)
      const nextIdx = (idx + direction + current.length) % current.length
      activateTab(current[nextIdx].id)
    },
    [activateTab],
  )

  useHotkey("ctrl+tab", () => cycleTab(1), {
    capture: true,
    stopPropagation: true,
    guard: terminalFocusGuard,
  })

  // Ctrl+Shift+Tab → cycle tabs backward
  useHotkey("ctrl+shift+tab", () => cycleTab(-1), {
    capture: true,
    stopPropagation: true,
    guard: terminalFocusGuard,
  })

  return (
    <div className="flex h-full w-full flex-col">
      {/* tab bar + toolbar */}
      <div className="h-10 shrink-0 w-full bg-background/50 flex items-center overflow-hidden border-b">
        {/* tabs — uses Radix Tabs identical to the editor tab bar */}
        <Tabs
          value={activeTabId ?? ""}
          onValueChange={switchTab}
          className="h-full flex-1 min-w-0 !gap-0"
        >
          <div
            ref={scrollContainerRef}
            className="h-full w-full min-w-0 overflow-x-auto overflow-y-hidden scrollbar-none"
          >
            <TabsList className="!h-full gap-0 bg-transparent justify-start rounded-none p-0 shrink-0">
              {tabs.map((tab, index) => (
                <HoverCard key={tab.id} openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <span
                      data-testid="terminal-tab"
                      className="h-full flex shrink-0"
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault()
                          closeTab(tab.id)
                        }
                      }}
                    >
                      <TabsTrigger value={tab.id} className={tabTriggerClasses(index === 0)}>
                        <span className="truncate max-w-[120px]">
                          {terminalDisplayName(tab.label)}
                        </span>
                        <TabCloseButton
                          label={tab.label}
                          isActive={tab.id === activeTabId}
                          onClose={() => closeTab(tab.id)}
                        />
                      </TabsTrigger>
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" align="start" className="w-auto max-w-md p-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {condensePath(tab.label)}
                    </span>
                  </HoverCardContent>
                </HoverCard>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {/* right controls: add tab + toolbar extras */}
        <div className="flex items-center gap-2 flex-shrink-0 px-2">
          <button
            onClick={addTab}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="new terminal tab"
            title="new terminal (⌘T)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {toolbarRight && (
            <>
              <div className="w-px h-4 bg-border" />
              {toolbarRight}
            </>
          )}
        </div>
      </div>

      {/* tab content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            id={tab.id}
            surfaceId={tab.surfaceId}
            cwd={cwd}
            isActive={tab.id === activeTabId}
            lockedTheme={lockedTheme}
            onReady={handleTabReady}
            onDispose={handleTabDispose}
            onTitleChange={handleTitleChange}
            onProfileLoaded={handleProfileLoaded}
          />
        ))}
      </div>
    </div>
  )
}
