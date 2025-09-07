import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { atom, useAtom, useAtomValue } from "jotai"
import { File as FileIcon } from "lucide-react"

import type { File } from "@/types/workspace"
import { quickOpenMenuOpenAtom, workspaceAtom } from "@/lib/atoms/atoms"
import { quickOpenFileItemsAtom } from "@/lib/atoms/file-tree"
import { workspaceRecentFilesAtom } from "@/lib/atoms/storage"
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

export function QuickOpen() {
  const [isOpen, setIsOpen] = useAtom(quickOpenMenuOpenAtom)
  const [search, setSearch] = useAtom(quickOpenSearchAtom)
  const allFileItems = useAtomValue(quickOpenFileItemsAtom)
  const recentFiles = useAtomValue(workspaceRecentFilesAtom)
  const navigate = useNavigate()
  const workspace = useAtomValue(workspaceAtom)

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
    return createQuickOpenItems(
      allFileItems,
      recentFiles,
      search,
      workspace?.path
    )
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
