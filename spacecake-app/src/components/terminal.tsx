import { useSetAtom } from "jotai"
import { Plus } from "lucide-react"
import type { ReactNode, RefObject } from "react"
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
import {
  deleteAllTerminalsForWorkspace,
  deleteTerminal,
  insertTerminal,
  selectTerminalsForWorkspace,
  updateTerminal,
  updateWorkspaceLayout,
} from "@/lib/db/mutations"
import { getTerminalTabState, setTerminalTabState } from "@/lib/terminal"
import { condensePath } from "@/lib/utils"
import type { TerminalPrimaryKey } from "@/schema/terminal"
import type { WorkspacePrimaryKey } from "@/schema/workspace"
import type { WorkspaceLayout } from "@/schema/workspace-layout"

interface TabState {
  id: TerminalPrimaryKey
  label: string
  surfaceId: string
  cwdPath: string
}

interface TerminalProps {
  cwd: string
  workspaceId: WorkspacePrimaryKey
  toolbarRight?: ReactNode
  onActiveApiChange?: (api: TerminalAPI | null) => void
  onLastTabClosed?: () => void
  /** ref to workspace layout — stable reference avoids effect re-triggers and memo breaks */
  layoutRef?: RefObject<WorkspaceLayout>
}

/** extract a short display name from a terminal title (path → basename, command → as-is) */
function terminalDisplayName(title: string): string {
  if (title.includes("/")) {
    const basename = title.split("/").filter(Boolean).pop()
    return basename ?? title
  }
  return title
}

export function Terminal({
  cwd,
  workspaceId,
  toolbarRight,
  onActiveApiChange,
  onLastTabClosed,
  layoutRef,
}: TerminalProps) {
  const { theme } = useTheme()
  // ghostty cannot switch theme after initialization, so lock the terminal
  // panel to the theme at first render - updates on app reload
  const lockedThemeRef = useRef(theme)
  const lockedTheme = lockedThemeRef.current

  // tabs start empty — populated by the init effect (restore or fresh)
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState<TerminalPrimaryKey | null>(null)
  const readyRef = useRef(false)

  // debounce timer for layout persistence
  const layoutWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // track APIs per tab so we can expose the active one
  const tabApisRef = useRef<Map<string, TerminalAPI>>(new Map())

  // per-surface statusline tracking
  const setActiveSurfaceId = useSetAtom(activeTerminalSurfaceIdAtom)
  const setStatuslineMap = useSetAtom(statuslineMapAtom)

  // per-tab profile loaded tracking
  const setProfileLoaded = useSetAtom(terminalProfileLoadedAtom)
  const profileLoadedTabsRef = useRef<Set<string>>(new Set())

  // tracks a tab created by addTab that hasn't mounted yet - used to
  // auto-focus only user-created tabs, not the initial tab on startup
  const pendingNewTabRef = useRef<string | null>(null)

  // scroll refs for the tab bar
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // latest refs - avoids stale closures without re-creating callbacks
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

  // central handler for all tab activations - replaces 4 separate effects
  const activateTab = useCallback(
    (tabId: TerminalPrimaryKey) => {
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
    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (tab) {
      window.electronAPI.claude.checkSurfaceAlive(tab.surfaceId)
    }
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label: title } : t)))
  }, [])

  const handleWorkingDirectoryChange = useCallback((tabId: string, cwdPath: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, cwdPath } : t)))
    // update database (fire-and-forget)
    updateTerminal(tabId as TerminalPrimaryKey, cwdPath).catch((err) =>
      console.error("failed to update terminal cwd:", err),
    )
  }, [])

  const addTab = useCallback(async () => {
    try {
      const row = await insertTerminal({
        workspace_id: workspaceId,
        cwd_path: cwd,
      })
      const tab: TabState = {
        id: row.id,
        label: "\u{1F370}",
        surfaceId: row.surface_id,
        cwdPath: row.cwd_path,
      }
      pendingNewTabRef.current = tab.id
      setTabs((prev) => [...prev, tab])
      activateTab(tab.id)
    } catch (err) {
      console.error("failed to create terminal tab:", err)
    }
  }, [activateTab, workspaceId, cwd])

  const closeTab = useCallback(
    (tabId: TerminalPrimaryKey) => {
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

      // remove from database (fire-and-forget)
      deleteTerminal(tabId).catch((err) => console.error("failed to delete terminal from db:", err))

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

  // radix onValueChange passes string — cast at the boundary
  const switchTab = useCallback(
    (tabId: string) => {
      activateTab(tabId as TerminalPrimaryKey)
    },
    [activateTab],
  )

  // reset atom on unmount
  useEffect(() => {
    return () => setProfileLoaded(false)
  }, [setProfileLoaded])

  // initialize tabs: restore from main process (survives reload), then DB (survives restart), or create fresh
  useEffect(() => {
    if (readyRef.current) return

    const init = async () => {
      if (readyRef.current) return

      // 1. try in-memory state (renderer reload — ptys are still alive)
      const memState = await getTerminalTabState(workspaceId)
      if (readyRef.current) return

      if (memState && memState.tabs.length > 0) {
        readyRef.current = true
        // in-memory store uses plain strings — cast at the boundary
        const restoredTabs: TabState[] = memState.tabs.map((t) => ({
          id: t.id as TerminalPrimaryKey,
          surfaceId: t.surfaceId,
          label: t.label,
          cwdPath: t.cwdPath,
        }))
        setTabs(restoredTabs)
        const activeId = (memState.activeId as TerminalPrimaryKey | null) ?? restoredTabs[0].id
        setActiveTabId(activeId)
        const activeTab = restoredTabs.find((t) => t.id === activeId)
        if (activeTab) setActiveSurfaceId(activeTab.surfaceId)
        return
      }

      // 2. fall back to database (app restart — ptys are gone, need fresh ones)
      try {
        const dbTerminals = await selectTerminalsForWorkspace(workspaceId)

        if (dbTerminals.length > 0) {
          readyRef.current = true

          // use workspace layout terminalTabs for ordering if available
          // layout stores plain strings — cast at the boundary
          const layoutTabs = layoutRef?.current?.terminalTabs
          const orderedIds = (layoutTabs?.tabs ?? []) as TerminalPrimaryKey[]
          const orderedIdSet = new Set(orderedIds)
          const dbMap = new Map(dbTerminals.map((t) => [t.id, t]))

          // build tabs in layout order, appending any not in the layout
          const orderedTerminals = [
            ...orderedIds.filter((id) => dbMap.has(id)).map((id) => dbMap.get(id)!),
            ...dbTerminals.filter((t) => !orderedIdSet.has(t.id)),
          ]

          const restoredTabs: TabState[] = orderedTerminals.map((t) => ({
            id: t.id,
            surfaceId: t.surface_id,
            label: "\u{1F370}",
            cwdPath: t.cwd_path,
          }))

          setTabs(restoredTabs)
          const layoutActiveId = layoutTabs?.activeId as TerminalPrimaryKey | null | undefined
          const activeId =
            (layoutActiveId && dbMap.has(layoutActiveId) ? layoutActiveId : null) ??
            restoredTabs[0].id
          setActiveTabId(activeId)
          const activeTab = restoredTabs.find((t) => t.id === activeId)
          if (activeTab) setActiveSurfaceId(activeTab.surfaceId)
          return
        }
      } catch (err) {
        console.error("failed to restore terminals from db:", err)
      }

      // 3. no saved state anywhere — clean up orphaned rows and create a fresh tab
      readyRef.current = true
      try {
        await deleteAllTerminalsForWorkspace(workspaceId)
        const row = await insertTerminal({
          workspace_id: workspaceId,
          cwd_path: cwd,
        })
        const tab: TabState = {
          id: row.id,
          label: "\u{1F370}",
          surfaceId: row.surface_id,
          cwdPath: row.cwd_path,
        }
        setTabs([tab])
        setActiveTabId(tab.id)
        setActiveSurfaceId(tab.surfaceId)
      } catch (err) {
        console.error("failed to create initial terminal tab:", err)
      }
    }

    init()
  }, [cwd, workspaceId, setActiveSurfaceId])

  // sync tab state to main process + workspace layout on changes (skip until init is done)
  useEffect(() => {
    if (!readyRef.current) return

    // sync to main process in-memory map (fast path for renderer reload)
    const stateToSync = {
      tabs: tabs.map((t) => ({
        id: t.id,
        surfaceId: t.surfaceId,
        label: t.label,
        cwdPath: t.cwdPath,
      })),
      activeId: activeTabId,
    }
    setTerminalTabState(workspaceId, stateToSync)

    // debounced sync to workspace layout (persistent for app restart)
    if (layoutWriteTimerRef.current) clearTimeout(layoutWriteTimerRef.current)
    layoutWriteTimerRef.current = setTimeout(() => {
      layoutWriteTimerRef.current = null
      const currentLayout = layoutRef?.current
      if (!currentLayout) return
      const terminalTabs = { tabs: tabs.map((t) => t.id), activeId: activeTabId }
      const currentTabs = currentLayout.terminalTabs
      // only write if changed
      if (
        currentTabs.activeId !== terminalTabs.activeId ||
        currentTabs.tabs.length !== terminalTabs.tabs.length ||
        currentTabs.tabs.some((id, i) => id !== terminalTabs.tabs[i])
      ) {
        updateWorkspaceLayout(workspaceId, {
          ...currentLayout,
          terminalTabs,
        }).catch((err) => console.error("failed to persist terminal tab order:", err))
      }
    }, 300)

    return () => {
      if (layoutWriteTimerRef.current) {
        clearTimeout(layoutWriteTimerRef.current)
        layoutWriteTimerRef.current = null
      }
    }
  }, [tabs, activeTabId, cwd, workspaceId])

  // handle horizontal scroll on wheel - must use native event for non-passive option
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

  // keep active tab visible on container resize (debounced to avoid animation stacking during drag)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const activeTab = container.querySelector(`[data-state="active"]`)
        activeTab?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" })
      }, 100)
    })
    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
      if (debounceTimer !== null) clearTimeout(debounceTimer)
    }
  }, [])

  // keyboard shortcuts (only when terminal panel is focused)
  // delegated middle-click handler for tab close (avoids per-tab closures)
  const handleTabListMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1) return
      const tabEl = (e.target as HTMLElement).closest<HTMLElement>("[data-tab-id]")
      if (tabEl?.dataset.tabId) {
        e.preventDefault()
        closeTab(tabEl.dataset.tabId as TerminalPrimaryKey)
      }
    },
    [closeTab],
  )

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
        {/* tabs - uses Radix Tabs identical to the editor tab bar */}
        <Tabs
          value={activeTabId ?? ""}
          onValueChange={switchTab}
          className="h-full flex-1 min-w-0 !gap-0"
        >
          <div
            ref={scrollContainerRef}
            className="h-full w-full min-w-0 overflow-x-auto overflow-y-hidden scrollbar-none"
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <TabsList
              className="!h-full gap-0 bg-transparent justify-start rounded-none p-0 shrink-0"
              onMouseDown={handleTabListMouseDown}
            >
              {tabs.map((tab, index) => (
                <HoverCard key={tab.id} openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <span
                      data-testid="terminal-tab"
                      data-tab-id={tab.id}
                      className="h-full flex shrink-0"
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
            <Plus className="h-4 w-4" />
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
            cwd={tab.cwdPath}
            isActive={tab.id === activeTabId}
            lockedTheme={lockedTheme}
            onReady={handleTabReady}
            onDispose={handleTabDispose}
            onTitleChange={handleTitleChange}
            onWorkingDirectoryChange={handleWorkingDirectoryChange}
            onProfileLoaded={handleProfileLoaded}
          />
        ))}
      </div>
    </div>
  )
}
