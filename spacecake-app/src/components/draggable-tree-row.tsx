import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview"
import { useStore } from "jotai"
import { useEffect, useRef } from "react"
import * as React from "react"
import { createRoot } from "react-dom/client"

import type { FlatFileTreeItem } from "@/lib/atoms/file-tree"
import { sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { canDropItem } from "@/lib/drag-drop-validation"
import type { AbsolutePath } from "@/types/workspace"

export interface DraggableTreeRowProps {
  flatItem: FlatFileTreeItem
  isRenaming: boolean
  children: React.ReactNode
  onExpandFolder: (folderPath: AbsolutePath) => void
  onHighlightFolder: (folderPath: string) => void
  onClearHighlight: () => void
}

function getParentPath(path: string): string {
  return path.substring(0, path.lastIndexOf("/"))
}

export function DraggableTreeRow({
  flatItem,
  isRenaming,
  children,
  onExpandFolder,
  onHighlightFolder,
  onClearHighlight,
}: DraggableTreeRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onExpandFolderRef = useRef(onExpandFolder)
  onExpandFolderRef.current = onExpandFolder
  const onHighlightFolderRef = useRef(onHighlightFolder)
  onHighlightFolderRef.current = onHighlightFolder
  const onClearHighlightRef = useRef(onClearHighlight)
  onClearHighlightRef.current = onClearHighlight

  const store = useStore()

  const { item, isExpanded } = flatItem
  const isFolder = item.kind === "folder"
  const isSystemFolder = isFolder && item.isSystemFolder

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
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render: ({ container }) => {
            const root = createRoot(container)
            root.render(
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "var(--sidebar-accent)",
                  color: "var(--sidebar-accent-foreground)",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.name}
              </div>,
            )
            return () => root.unmount()
          },
        })
      },
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
        if (isSystemFolder) return false
        const sourcePath = source.data.path as AbsolutePath
        const sourceKind = source.data.kind as "file" | "folder"
        const targetFolderPath = isFolder
          ? (item.path as AbsolutePath)
          : (getParentPath(item.path) as AbsolutePath)
        const currentTree = store.get(sortedFileTreeAtom)
        return canDropItem(sourcePath, sourceKind, targetFolderPath, currentTree).valid
      },
      getData: () => ({ path: item.path, kind: item.kind }),
      onDrag: () => {
        const targetFolderPath = isFolder ? item.path : getParentPath(item.path)
        onHighlightFolderRef.current(targetFolderPath)

        // auto-expand collapsed folders on hover
        if (isFolder && !isExpanded) {
          if (!expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
              onExpandFolderRef.current(item.path as AbsolutePath)
              expandTimerRef.current = null
            }, 500)
          }
        }
      },
      onDragLeave: () => {
        onClearHighlightRef.current()
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current)
          expandTimerRef.current = null
        }
      },
      onDrop: () => {
        onClearHighlightRef.current()
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current)
          expandTimerRef.current = null
        }
      },
    })
  }, [item.path, item.kind, isFolder, isSystemFolder, isExpanded, store])

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
    </div>
  )
}
