import { useCallback, useEffect, useRef } from "react"
import type { PaneMachineRef } from "@/machines/pane"
import { PaneItemWithFile, PanePrimaryKey } from "@/schema/pane"

import { useActivePaneItemId, usePaneItems } from "@/hooks/use-pane-items"
import { Tabs, TabsList } from "@/components/ui/tabs"
import { TabItem } from "@/components/tab-bar/tab-item"

interface TabBarProps {
  paneId: PanePrimaryKey
  machine: PaneMachineRef
}

export function TabBar({ paneId, machine }: TabBarProps) {
  const { items, loading, empty } = usePaneItems(paneId)
  const activePaneItemId = useActivePaneItemId(paneId)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Handle horizontal scroll on wheel - must use native event for non-passive option
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Always try to scroll - let the browser handle if there's no overflow
      e.preventDefault()
      container.scrollLeft += e.deltaY || e.deltaX
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [items.length])

  const handleTabChange = useCallback(
    (paneItemId: string) => {
      const item = items.find((i) => i.id === paneItemId)
      if (!item) return
      machine.send({ type: "pane.item.activate", item })
    },
    [machine, items]
  )

  const handleClose = useCallback(
    (e: React.MouseEvent, item: PaneItemWithFile) => {
      e.stopPropagation()
      machine.send({
        type: "pane.item.close",
        itemId: item.id,
        filePath: item.filePath,
        isClosingActiveTab: item.id === activePaneItemId,
      })
    },
    [machine, activePaneItemId]
  )

  // Don't render if loading or no tabs
  if (loading || empty) {
    return null
  }

  // Horizontal tab scrolling requires:
  // - w-full on scroll container (explicit width for overflow calc)
  // - shrink-0 on TabsList and TabItem (prevent collapse, force overflow)
  return (
    <Tabs
      value={activePaneItemId ?? ""}
      onValueChange={handleTabChange}
      className="h-full flex-1 min-w-0"
    >
      <div
        ref={scrollContainerRef}
        className="h-full w-full min-w-0 overflow-x-auto overflow-y-hidden scrollbar-none"
      >
        <TabsList className="!h-full gap-0 bg-transparent justify-start rounded-none p-0 shrink-0 [&>*:first-child_button]:pl-4">
          {items.map((item) => {
            const fileName = item.filePath.split("/").pop() || "untitled"
            return (
              <TabItem
                key={item.id}
                id={item.id}
                fileName={fileName}
                filePath={item.filePath}
                isActive={item.id === activePaneItemId}
                onClose={(e) => handleClose(e, item)}
              />
            )
          })}
        </TabsList>
      </div>
    </Tabs>
  )
}
