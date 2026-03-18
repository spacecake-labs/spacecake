import { Eye, EyeOff, GitBranch, LayoutGrid, ListTodo, RotateCcw, Terminal } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { memo, useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { DockablePanelKind, DockPosition } from "@/schema/workspace-layout"
import { defaultWorkspaceLayout } from "@/schema/workspace-layout"

interface PanelConfig {
  id: DockablePanelKind
  label: string
  icon: LucideIcon
  color: string
}

const PANEL_CONFIGS: PanelConfig[] = [
  { id: "git", label: "git", icon: GitBranch, color: "bg-rose-500" },
  { id: "terminal", label: "terminal", icon: Terminal, color: "bg-emerald-500" },
  { id: "task", label: "tasks", icon: ListTodo, color: "bg-blue-500" },
]

const PANEL_LABELS: Record<DockablePanelKind, string> = {
  git: "git",
  terminal: "terminal",
  task: "tasks",
}

export interface DockLayoutEditorProps {
  terminalDock: DockPosition
  taskDock: DockPosition
  gitDock: DockPosition
  isTerminalExpanded: boolean
  isTaskExpanded: boolean
  isGitExpanded: boolean
  onDockChange: (panel: DockablePanelKind, dock: DockPosition) => void
  onToggle: (panel: DockablePanelKind) => void
}

function useDockLayout(props: DockLayoutEditorProps) {
  const [selectedPanel, setSelectedPanel] = useState<DockablePanelKind | null>(null)
  const selectedPanelRef = useRef(selectedPanel)
  selectedPanelRef.current = selectedPanel

  const getDockForPanel = useCallback(
    (panel: DockablePanelKind): DockPosition => {
      switch (panel) {
        case "terminal":
          return props.terminalDock
        case "task":
          return props.taskDock
        case "git":
          return props.gitDock
      }
    },
    [props.terminalDock, props.taskDock, props.gitDock],
  )

  const isExpanded = useCallback(
    (panel: DockablePanelKind): boolean => {
      switch (panel) {
        case "terminal":
          return props.isTerminalExpanded
        case "task":
          return props.isTaskExpanded
        case "git":
          return props.isGitExpanded
      }
    },
    [props.isTerminalExpanded, props.isTaskExpanded, props.isGitExpanded],
  )

  const getPanelInDock = useCallback(
    (dock: DockPosition): (PanelConfig & { expanded: boolean }) | undefined => {
      const panel = PANEL_CONFIGS.find((p) => getDockForPanel(p.id) === dock)
      if (!panel) return undefined
      return { ...panel, expanded: isExpanded(panel.id) }
    },
    [getDockForPanel, isExpanded],
  )

  const handlePanelClick = useCallback((panelId: DockablePanelKind) => {
    setSelectedPanel((prev) => (prev === panelId ? null : panelId))
  }, [])

  const handleDockClick = useCallback(
    (dock: DockPosition) => {
      const current = selectedPanelRef.current
      if (!current) {
        const panelInDock = PANEL_CONFIGS.find((p) => getDockForPanel(p.id) === dock)
        if (panelInDock) setSelectedPanel(panelInDock.id)
        return
      }
      if (getDockForPanel(current) === dock) {
        setSelectedPanel(null)
        return
      }
      props.onDockChange(current, dock)
      setSelectedPanel(null)
    },
    [getDockForPanel, props.onDockChange],
  )

  const resetLayout = useCallback(() => {
    const defaults = defaultWorkspaceLayout.dock
    if (defaults.left) props.onDockChange(defaults.left, "left")
    if (defaults.right) props.onDockChange(defaults.right, "right")
    if (defaults.bottom) props.onDockChange(defaults.bottom, "bottom")
    setSelectedPanel(null)
  }, [props.onDockChange])

  const clearSelection = useCallback(() => setSelectedPanel(null), [])

  return {
    selectedPanel,
    clearSelection,
    resetLayout,
    getPanelInDock,
    getDockForPanel,
    handleDockClick,
    handlePanelClick,
    isExpanded,
    togglePanel: props.onToggle,
  }
}

export const DockLayoutSwitcher = memo(function DockLayoutSwitcher(props: DockLayoutEditorProps) {
  const [open, setOpen] = useState(false)
  const layout = useDockLayout(props)

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) layout.clearSelection()
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="edit layout"
          title="edit layout"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-popover/95 backdrop-blur-sm"
        side="top"
        align="start"
        sideOffset={8}
        onPointerDownOutside={(e) => {
          // let genuine outside clicks close the popover,
          // but prevent layout reflows from dismissing it
          const target = e.target as HTMLElement | null
          if (target?.closest("[data-slot='popover-content']")) {
            e.preventDefault()
          }
        }}
      >
        <DockLayoutEditorContent
          selectedPanel={layout.selectedPanel}
          resetLayout={layout.resetLayout}
          getPanelInDock={layout.getPanelInDock}
          getDockForPanel={layout.getDockForPanel}
          handleDockClick={layout.handleDockClick}
          handlePanelClick={layout.handlePanelClick}
          isExpanded={layout.isExpanded}
          togglePanel={layout.togglePanel}
        />
      </PopoverContent>
    </Popover>
  )
})

function DockLayoutEditorContent({
  selectedPanel,
  resetLayout,
  getPanelInDock,
  getDockForPanel,
  handleDockClick,
  handlePanelClick,
  isExpanded,
  togglePanel,
}: {
  selectedPanel: DockablePanelKind | null
  resetLayout: () => void
  getPanelInDock: (dock: DockPosition) => (PanelConfig & { expanded: boolean }) | undefined
  getDockForPanel: (panel: DockablePanelKind) => DockPosition
  handleDockClick: (dock: DockPosition) => void
  handlePanelClick: (panelId: DockablePanelKind) => void
  isExpanded: (panel: DockablePanelKind) => boolean
  togglePanel: (panel: DockablePanelKind) => void
}) {
  return (
    <>
      {/* header */}
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-xs @xs:text-sm font-medium text-foreground">edit layout</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] @xs:text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={resetLayout}
          >
            <RotateCcw className="size-3 mr-1" />
            restore defaults
          </Button>
        </div>
        <p className="text-[10px] @xs:text-xs text-muted-foreground mt-1">
          {selectedPanel
            ? `select a new dock position for the ${PANEL_LABELS[selectedPanel]} panel`
            : "click a panel, then choose where to dock it"}
        </p>
      </div>

      {/* visual minimap */}
      <div className="p-3">
        <div className="relative bg-muted/30 rounded-lg p-2 border border-border/50">
          <div className="flex gap-1.5 h-28">
            <DropDock
              dock="left"
              panel={getPanelInDock("left")}
              isTarget={selectedPanel !== null && getDockForPanel(selectedPanel) !== "left"}
              isCurrentDock={selectedPanel !== null && getDockForPanel(selectedPanel) === "left"}
              onClick={handleDockClick}
              className="w-14 rounded-l-md"
            />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex-1 rounded-md bg-background border border-border/50 flex items-center justify-center">
                <span className="text-[9px] @xs:text-xs text-muted-foreground/60 font-medium">
                  editor
                </span>
              </div>
              <DropDock
                dock="bottom"
                panel={getPanelInDock("bottom")}
                isTarget={selectedPanel !== null && getDockForPanel(selectedPanel) !== "bottom"}
                isCurrentDock={
                  selectedPanel !== null && getDockForPanel(selectedPanel) === "bottom"
                }
                onClick={handleDockClick}
                className="h-9 rounded-b-md"
              />
            </div>
            <DropDock
              dock="right"
              panel={getPanelInDock("right")}
              isTarget={selectedPanel !== null && getDockForPanel(selectedPanel) !== "right"}
              isCurrentDock={selectedPanel !== null && getDockForPanel(selectedPanel) === "right"}
              onClick={handleDockClick}
              className="w-14 rounded-r-md"
            />
          </div>
        </div>
      </div>

      {/* panel list */}
      <div className="px-3 pb-3">
        <div className="text-[10px] @xs:text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">
          panels
        </div>
        <div className="space-y-1">
          {PANEL_CONFIGS.map((panel) => {
            const expanded = isExpanded(panel.id)
            const isSelected = selectedPanel === panel.id
            return (
              <div
                key={panel.id}
                onClick={() => handlePanelClick(panel.id)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/50 bg-background hover:bg-muted/50",
                  !expanded && !isSelected && "opacity-50",
                )}
              >
                <div
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    panel.color,
                    !expanded && !isSelected && "opacity-30",
                  )}
                />
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <panel.icon
                    className={cn(
                      "size-3.5 text-muted-foreground",
                      !expanded && !isSelected && "opacity-50",
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs @xs:text-sm font-medium truncate",
                      !expanded && !isSelected && "text-muted-foreground",
                    )}
                  >
                    {panel.label}
                  </span>
                </div>
                <span className="text-[9px] @xs:text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {getDockForPanel(panel.id)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePanel(panel.id)
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label={expanded ? `hide ${panel.label}` : `show ${panel.label}`}
                >
                  {expanded ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export const DockLayoutEditor = memo(function DockLayoutEditor(props: DockLayoutEditorProps) {
  const layout = useDockLayout(props)

  return (
    <div className="@container">
      <DockLayoutEditorContent
        selectedPanel={layout.selectedPanel}
        resetLayout={layout.resetLayout}
        getPanelInDock={layout.getPanelInDock}
        getDockForPanel={layout.getDockForPanel}
        handleDockClick={layout.handleDockClick}
        handlePanelClick={layout.handlePanelClick}
        isExpanded={layout.isExpanded}
        togglePanel={layout.togglePanel}
      />
    </div>
  )
})

function DropDock({
  dock,
  panel,
  isTarget,
  isCurrentDock,
  onClick,
  className,
}: {
  dock: DockPosition
  panel?: PanelConfig & { expanded: boolean }
  isTarget: boolean
  isCurrentDock: boolean
  onClick: (dock: DockPosition) => void
  className?: string
}) {
  return (
    <div
      onClick={() => onClick(dock)}
      className={cn(
        "border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1",
        "cursor-pointer",
        isTarget
          ? "border-primary bg-primary/10"
          : isCurrentDock
            ? "border-primary/40 bg-primary/5"
            : panel
              ? "border-transparent bg-muted/50 hover:bg-muted/70"
              : "border-border/30 bg-muted/20",
        panel && !panel.expanded && !isTarget && !isCurrentDock && "opacity-40",
        className,
      )}
    >
      {panel ? (
        <>
          <div className={cn("size-3 rounded-sm", panel.color)} />
          <span className="text-[8px] @xs:text-[10px] text-muted-foreground font-medium leading-none">
            {panel.label}
          </span>
        </>
      ) : (
        <span className="text-[8px] @xs:text-[10px] text-muted-foreground/40">{dock}</span>
      )}
    </div>
  )
}
