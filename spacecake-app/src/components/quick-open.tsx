import * as React from "react"
import type { PaneMachineRef } from "@/machines/pane"
import { useVirtualizer } from "@tanstack/react-virtual"
import { atom, useAtom, useAtomValue } from "jotai"
import { File as FileIcon } from "lucide-react"

import { AbsolutePath, File, WorkspaceInfo } from "@/types/workspace"
import { fileTreeAtom, quickOpenMenuOpenAtom } from "@/lib/atoms/atoms"
import { getQuickOpenFileItems } from "@/lib/atoms/file-tree"
import { createQuickOpenItems } from "@/lib/filter-files"
import { fileTypeFromFileName } from "@/lib/workspace"
import { useRecentFiles } from "@/hooks/use-recent-files"
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const quickOpenSearchAtom = atom("")
const quickOpenParentAtom = atom<HTMLDivElement | null>(null)

interface QuickOpenProps {
  workspacePath: WorkspaceInfo["path"]
  machine: PaneMachineRef
}

export function QuickOpen({ workspacePath, machine }: QuickOpenProps) {
  const [isOpen, setIsOpen] = useAtom(quickOpenMenuOpenAtom)
  const [search, setSearch] = useAtom(quickOpenSearchAtom)

  // Get file tree from atom and derive file items
  const fileTree = useAtomValue(fileTreeAtom)
  const allFileItems = getQuickOpenFileItems(workspacePath, fileTree)
  const recentFiles = useRecentFiles(workspacePath)

  if (recentFiles.error) {
    console.error("error getting recent files", recentFiles.error)
  }

  const [parent, setParent] = useAtom(quickOpenParentAtom)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [setIsOpen])

  const filteredItems = React.useMemo(() => {
    if (recentFiles.data) {
      const recentFilesList = recentFiles.data.map((file) => {
        const filePath = AbsolutePath(file.path)
        const fileName = file.path.split("/").pop() || file.path
        return {
          path: filePath,
          name: fileName,
          fileType: fileTypeFromFileName(file.path),
          lastAccessed: file.last_accessed_at
            ? new Date(file.last_accessed_at).getTime()
            : 0,
          workspacePath: workspacePath,
        }
      })

      return createQuickOpenItems(
        allFileItems,
        recentFilesList,
        search,
        workspacePath
      )
    }
    return []
  }, [search, allFileItems, recentFiles, workspacePath])

  const rowVirtualizer = useVirtualizer({
    count: filteredItems?.length ?? 0,
    getScrollElement: () => parent,
    estimateSize: () => 32,
    overscan: 5,
  })

  const handleSelectFile = (file: File) => {
    if (!workspacePath) return

    // Use the pane machine to open files - this serializes the operation
    // with close operations, preventing race conditions.
    machine.send({ type: "pane.file.open", filePath: AbsolutePath(file.path) })
    setIsOpen(false)
  }

  // reset search on close
  React.useEffect(() => {
    if (!isOpen) {
      setSearch("")
    }
  }, [isOpen, setSearch])

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      shouldFilter={false}
      title="quick open"
      className="top-4 translate-y-0"
    >
      <CommandInput
        placeholder="search files..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList ref={setParent}>
        {rowVirtualizer.getVirtualItems().length === 0 && search ? (
          <CommandEmpty>no results found</CommandEmpty>
        ) : null}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = filteredItems[virtualItem.index]
            return (
              <CommandItem
                key={virtualItem.key}
                className="cursor-pointer"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                value={item.file.path}
                onSelect={() => handleSelectFile(item.file)}
              >
                <FileIcon className="mr-2 h-4 w-4" />
                <span>{item.file.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {item.displayPath}
                </span>
              </CommandItem>
            )
          })}
        </div>
      </CommandList>
    </CommandDialog>
  )
}
