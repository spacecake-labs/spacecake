import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item"
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { useStore } from "jotai"
import { useEffect, useRef } from "react"
import * as React from "react"

import type { FlatFileTreeItem } from "@/lib/atoms/file-tree"
import { sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { canDropItem } from "@/lib/drag-drop-validation"
import type { AbsolutePath } from "@/types/workspace"

export interface DraggableTreeRowProps {
  flatItem: FlatFileTreeItem
  isRenaming: boolean
  children: React.ReactNode
  onExpandFolder: (folderPath: AbsolutePath) => void
}

export function DraggableTreeRow({
  flatItem,
  isRenaming,
  children,
  onExpandFolder,
}: DraggableTreeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const makeChildRef = useRef<HTMLDivElement>(null)
  const reorderAboveRef = useRef<HTMLDivElement>(null)
  const reorderBelowRef = useRef<HTMLDivElement>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onExpandFolderRef = useRef(onExpandFolder)
  onExpandFolderRef.current = onExpandFolder

  const store = useStore()

  const { item, depth, isExpanded } = flatItem
  const isFolder = item.kind === "folder"
  const isSystemFolder = isFolder && item.isSystemFolder

  function updateIndicators(inst: Instruction | null) {
    makeChildRef.current?.style.setProperty(
      "display",
      inst?.type === "make-child" ? "block" : "none",
    )
    reorderAboveRef.current?.style.setProperty(
      "display",
      inst?.type === "reorder-above" ? "block" : "none",
    )
    reorderBelowRef.current?.style.setProperty(
      "display",
      inst?.type === "reorder-below" ? "block" : "none",
    )
  }

  // draggable registration
  useEffect(() => {
    const el = rowRef.current
    if (!el) return

    return draggable({
      element: el,
      canDrag: () => !isSystemFolder && !isRenaming,
      getInitialData: () => ({
        path: item.path,
        kind: item.kind,
        name: item.name,
      }),
      onDragStart: () => {
        el.style.opacity = "0.4"
      },
      onDrop: () => {
        el.style.opacity = "1"
      },
    })
  }, [item.path, item.kind, item.name, isSystemFolder, isRenaming])

  // drop target registration
  useEffect(() => {
    const el = rowRef.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const sourcePath = source.data.path as AbsolutePath
        const sourceKind = source.data.kind as "file" | "folder"
        const targetFolderPath = isFolder
          ? (item.path as AbsolutePath)
          : (item.path.substring(0, item.path.lastIndexOf("/")) as AbsolutePath)
        const currentTree = store.get(sortedFileTreeAtom)
        return canDropItem(sourcePath, sourceKind, targetFolderPath, currentTree).valid
      },
      getData: ({ input, element }) => {
        const data = { path: item.path, kind: item.kind }
        return attachInstruction(data, {
          input,
          element,
          currentLevel: depth,
          indentPerLevel: 12,
          mode: isFolder ? "expanded" : "standard",
          block: isSystemFolder ? ["make-child", "reorder-above", "reorder-below"] : [],
        })
      },
      onDrag: ({ self }) => {
        const inst = extractInstruction(self.data)
        updateIndicators(inst)

        // auto-expand collapsed folders on hover
        if (isFolder && !isExpanded && inst?.type === "make-child") {
          if (!expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
              onExpandFolderRef.current(item.path as AbsolutePath)
              expandTimerRef.current = null
            }, 500)
          }
        } else if (expandTimerRef.current && inst?.type !== "make-child") {
          clearTimeout(expandTimerRef.current)
          expandTimerRef.current = null
        }
      },
      onDragLeave: () => {
        updateIndicators(null)
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current)
          expandTimerRef.current = null
        }
      },
      onDrop: () => {
        updateIndicators(null)
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current)
          expandTimerRef.current = null
        }
      },
    })
  }, [item.path, item.kind, depth, isFolder, isSystemFolder, isExpanded, store])

  // cleanup expand timer on unmount
  useEffect(() => {
    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current)
      }
    }
  }, [])

  return (
    <div ref={rowRef} className="relative" data-tree-path={item.path}>
      {children}
      <div
        ref={makeChildRef}
        className="pointer-events-none absolute inset-0 rounded-sm bg-accent/50 ring-1 ring-ring"
        style={{ display: "none" }}
      />
      <div
        ref={reorderAboveRef}
        className="pointer-events-none absolute top-0 left-0 right-0 h-0.5 bg-primary"
        style={{ display: "none" }}
      />
      <div
        ref={reorderBelowRef}
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
        style={{ display: "none" }}
      />
    </div>
  )
}
