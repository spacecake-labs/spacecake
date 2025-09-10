import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { atom, useAtom, useAtomValue } from "jotai"
import { File as FileIcon } from "lucide-react"

import type { File, WorkspaceInfo } from "@/types/workspace"
import { fileTreeAtom, quickOpenMenuOpenAtom } from "@/lib/atoms/atoms"
import { getQuickOpenFileItems } from "@/lib/atoms/file-tree"
import { loadRecentFilesSync } from "@/lib/atoms/storage"
import { createQuickOpenItems } from "@/lib/filter-files"
import { encodeBase64Url } from "@/lib/utils"
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
  workspace: WorkspaceInfo
}

export function QuickOpen({ workspace }: QuickOpenProps) {
  console.log("QuickOpen component rendered with workspace:", workspace.path)
  const [isOpen, setIsOpen] = useAtom(quickOpenMenuOpenAtom)
  const [search, setSearch] = useAtom(quickOpenSearchAtom)

  // Get file tree from atom and derive file items
  const fileTree = useAtomValue(fileTreeAtom)
  const allFileItems = getQuickOpenFileItems(workspace, fileTree)
  const recentFiles = loadRecentFilesSync(workspace.path)
  console.log(
    "QuickOpen - allFileItems:",
    allFileItems.length,
    "recentFiles:",
    recentFiles.length
  )
  const navigate = useNavigate()

  const [parent, setParent] = useAtom(quickOpenParentAtom)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        console.log("Quick open keyboard shortcut triggered")
        e.preventDefault()
        setIsOpen()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [setIsOpen])

  const filteredItems = React.useMemo(() => {
    console.log(
      "Creating filtered items with search:",
      search,
      "allFileItems:",
      allFileItems.length,
      "recentFiles:",
      recentFiles.length
    )
    const items = createQuickOpenItems(
      allFileItems,
      recentFiles,
      search,
      workspace?.path
    )
    console.log("Filtered items result:", items.length)
    return items
  }, [search, allFileItems, recentFiles, workspace?.path])

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parent,
    estimateSize: () => 32,
    overscan: 5,
  })

  const handleSelectFile = (file: File) => {
    if (!workspace?.path) return

    const workspaceIdEncoded = encodeBase64Url(workspace.path)
    const filePathEncoded = encodeBase64Url(file.path)

    navigate({
      to: "/w/$workspaceId/f/$",
      params: {
        workspaceId: workspaceIdEncoded,
        _splat: filePathEncoded,
      },
    })
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
        {rowVirtualizer.getVirtualItems().length === 0 && search.length > 0 ? (
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
