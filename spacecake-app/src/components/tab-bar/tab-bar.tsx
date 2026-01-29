import { useCallback } from "react"
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

  return (
    <div className="h-9 shrink-0 border-b bg-muted/30 flex items-center px-2">
      <Tabs
        value={activePaneItemId ?? ""}
        onValueChange={handleTabChange}
        className="flex-1 min-w-0"
      >
        <TabsList
          variant="line"
          className="h-8 gap-0 bg-transparent justify-start"
        >
          {items.map((item) => {
            const fileName = item.filePath.split("/").pop() || "untitled"
            return (
              <TabItem
                key={item.id}
                id={item.id}
                fileName={fileName}
                isActive={item.id === activePaneItemId}
                onClose={(e) => handleClose(e, item)}
              />
            )
          })}
        </TabsList>
      </Tabs>
    </div>
  )
}
