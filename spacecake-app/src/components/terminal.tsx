import type { ReactNode } from "react"

import { useSetAtom } from "jotai"
import { Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import type { TerminalAPI } from "@/hooks/use-ghostty-engine"

import { TabCloseButton, tabTriggerClasses } from "@/components/tab-bar/tab-close-button"
import { TerminalTab } from "@/components/terminal-tab"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { terminalProfileLoadedAtom } from "@/lib/atoms/atoms"
import { condensePath } from "@/lib/utils"

interface TabState {
  id: string
  label: string
}

interface TerminalProps {
  cwd: string
  toolbarRight?: ReactNode
  onActiveApiChange?: (api: TerminalAPI | null) => void
  onLastTabClosed?: () => void
}

function makeTab(label?: string): TabState {
  const id = `terminal-tab-${crypto.randomUUID()}`
  return { id, label: label ?? "\u{1F370}" }
}

/** extract a short display name from a terminal title (path → basename, command → as-is) */
function terminalDisplayName(title: string): string {
  if (title.includes("/")) {
    const basename = title.split("/").filter(Boolean).pop()
    return basename ?? title
  }
  return title
}

function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function Terminal({ cwd, toolbarRight, onActiveApiChange, onLastTabClosed }: TerminalProps) {
  const [initialTab] = useState(() => makeTab())
  const [tabs, setTabs] = useState<TabState[]>(() => [initialTab])
  const [activeTabId, setActiveTabId] = useState<string | null>(initialTab.id)

  // track APIs per tab so we can expose the active one
  const tabApisRef = useRef<Map<string, TerminalAPI>>(new Map())

  // per-tab profile loaded tracking
  const setProfileLoaded = useSetAtom(terminalProfileLoadedAtom)
  const profileLoadedTabsRef = useRef<Set<string>>(new Set())

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

  // central handler for all tab activations — replaces 4 separate effects
  const activateTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId)
      syncActiveApi(tabId)
      setProfileLoaded(profileLoadedTabsRef.current.has(tabId))

      // scroll into view + focus after render
      requestAnimationFrame(() => {
        scrollContainerRef.current
          ?.querySelector(`[data-state="active"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })

        const panel = document.querySelector('[data-testid="terminal-panel"]')
        const activeContent = panel?.querySelector(
          '[data-testid="terminal-tab-content"][data-active="true"]',
        )
        activeContent?.querySelector("textarea")?.focus()
      })
    },
    [syncActiveApi, setProfileLoaded],
  )

  const handleTabReady = useCallback(
    (tabId: string, api: TerminalAPI) => {
      tabApisRef.current.set(tabId, api)
      if (activeTabIdRef.current === tabId) {
        syncActiveApi(tabId)
      }
    },
    [syncActiveApi],
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
    setTabs((prev) => [...prev, tab])
    activateTab(tab.id)
  }, [activateTab])

  const closeTab = useCallback(
    (tabId: string) => {
      const prev = tabsRef.current
      const idx = prev.findIndex((t) => t.id === tabId)
      const next = prev.filter((t) => t.id !== tabId)

      setTabs(next)

      if (activeTabIdRef.current === tabId) {
        if (next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1)
          activateTab(next[newIdx].id)
        } else {
          onLastTabClosedRef.current?.()
        }
      }
    },
    [activateTab],
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
  useEffect(() => {
    const isTerminalFocused = () => {
      const panel = document.querySelector('[data-testid="terminal-panel"]')
      return panel?.contains(document.activeElement) ?? false
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTerminalFocused()) return

      const isMod = e.metaKey || e.ctrlKey

      // Cmd+T → new tab
      if (isMod && e.key === "t") {
        e.preventDefault()
        e.stopPropagation()
        addTab()
        return
      }

      // Cmd+W → close active tab (only when >0 tabs)
      if (isMod && e.key === "w") {
        const current = tabsRef.current
        const active = activeTabIdRef.current
        if (current.length > 0 && active) {
          e.preventDefault()
          e.stopPropagation()
          closeTab(active)
        }
        return
      }

      // Ctrl+Tab / Ctrl+Shift+Tab → cycle tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()
        const current = tabsRef.current
        if (current.length <= 1) return
        const idx = current.findIndex((t) => t.id === activeTabIdRef.current)
        const nextIdx = e.shiftKey
          ? (idx - 1 + current.length) % current.length
          : (idx + 1) % current.length
        activateTab(current[nextIdx].id)
        return
      }
    }

    // use capture so we intercept before the editor's Cmd+W handler
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [addTab, closeTab, activateTab])

  return (
    <div className="flex h-full w-full flex-col" data-testid="terminal-panel">
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
            cwd={cwd}
            isActive={tab.id === activeTabId}
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
