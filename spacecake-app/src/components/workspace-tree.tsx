import { useEffect, useRef } from "react"
import * as React from "react"
import { Link } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ChevronRight,
  FileWarning,
  Loader2,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react"

import { AbsolutePath, File, Folder, WorkspaceInfo } from "@/types/workspace"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import type { FlatTreeItem } from "@/lib/atoms/file-tree"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { supportedViews } from "@/lib/language-support"
import { encodeBase64Url } from "@/lib/utils"
import { getNavItemIcon } from "@/lib/workspace"
import { useWorkspaceCache } from "@/hooks/use-workspace-cache"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Component for the rename input field
function RenameInput({
  value,
  onChange,
  onKeyDown,
  validationError,
  autoFocus = true,
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  validationError?: string | null
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Select filename without extension (like VSCode) - only on initial focus
      const lastDotIndex = value.lastIndexOf(".")
      const selectEnd = lastDotIndex > 0 ? lastDotIndex : value.length
      inputRef.current.setSelectionRange(0, selectEnd)
    }
  }, [autoFocus])

  return (
    <div className="flex flex-col">
      <SidebarMenuButton className="cursor-default">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={`h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${
            validationError ? "border-destructive" : ""
          }`}
          autoFocus={autoFocus}
          ref={inputRef}
          aria-invalid={!!validationError}
        />
      </SidebarMenuButton>
      {validationError && (
        <div className="px-3 py-1 text-xs text-destructive">
          {validationError}
        </div>
      )}
    </div>
  )
}

// Component for the dropdown menu (for files and folders)
function ItemDropdownMenu({
  item,
  onStartRename,
  onStartDelete,
  isRenaming,
  onExpandFolder,
}: {
  item: File | Folder
  onStartRename: (item: File | Folder) => void
  onStartDelete: (item: File | Folder) => void
  isRenaming: boolean
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
}) {
  if (isRenaming) return null

  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  )
  const setContextItemName = useSetAtom(contextItemNameAtom)

  const itemTitle = item.name
  const itemPath = item.path
  const isItemFolder = item.kind === "folder"

  const startCreatingFile = () => {
    setIsCreatingInContext({ kind: "file", parentPath: itemPath })
    setContextItemName("")

    // Auto-expand the parent folder so the input field is visible
    if (isItemFolder && onExpandFolder) {
      onExpandFolder(itemPath, true)
    }
  }

  const startCreatingFolder = () => {
    setIsCreatingInContext({ kind: "folder", parentPath: itemPath })
    setContextItemName("")

    // Auto-expand the parent folder so the input field is visible
    if (isItemFolder && onExpandFolder) {
      onExpandFolder(itemPath, true)
    }
  }

  const cancelCreating = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  const isCreatingInThisContext = isCreatingInContext?.parentPath === itemPath

  return (
    <>
      {isCreatingInThisContext ? (
        <SidebarMenuAction className="cursor-pointer" onClick={cancelCreating}>
          <X className="h-3 w-3" />
          <span className="sr-only">cancel</span>
        </SidebarMenuAction>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              showOnHover
              className="cursor-pointer"
              aria-label="more options"
              data-testid={`more-options-${itemTitle}`}
            >
              <MoreHorizontal />
              <span className="sr-only">more options</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            {isItemFolder && (
              <>
                <DropdownMenuItem onClick={startCreatingFile}>
                  <span>new file</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={startCreatingFolder}>
                  <span>new folder</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => onStartRename(item)}>
              <span>rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStartDelete(item)}>
              <span>delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}

// Component for the workspace-level dropdown menu (plus icon)
export function WorkspaceDropdownMenu({
  workspace,
}: {
  workspace: WorkspaceInfo
}) {
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  )
  const setContextItemName = useSetAtom(contextItemNameAtom)

  const startCreatingFile = () => {
    if (!workspace?.path) return
    setIsCreatingInContext({ kind: "file", parentPath: workspace.path })
    setContextItemName("")
  }

  const startCreatingFolder = () => {
    if (!workspace?.path) return
    setIsCreatingInContext({ kind: "folder", parentPath: workspace.path })
    setContextItemName("")
  }

  const cancelCreating = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  const isCreatingInWorkspace =
    isCreatingInContext?.parentPath === workspace?.path

  return (
    <>
      {isCreatingInWorkspace ? (
        <SidebarMenuAction className="cursor-pointer" onClick={cancelCreating}>
          <X className="h-3 w-3" />
          <span className="sr-only">cancel</span>
        </SidebarMenuAction>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-accent cursor-pointer"
              title="create file or folder"
            >
              <Plus className="h-3 w-3" />
              <span className="sr-only">create file or folder</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onClick={startCreatingFile}>
              <span>new file</span>
              <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={startCreatingFolder}>
              <span>new folder</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}

// Component for the cancel rename button
function CancelRenameButton({ onCancel }: { onCancel: () => void }) {
  return (
    <SidebarMenuAction className="cursor-pointer" onClick={onCancel}>
      <X className="h-3 w-3" />
      <span className="sr-only">cancel</span>
    </SidebarMenuAction>
  )
}

function FileStatusIndicator({ filePath }: { filePath: AbsolutePath }) {
  const state = useAtomValue(fileStateAtomFamily(filePath)).value

  if (state === "Dirty") {
    return (
      <div
        className="ml-auto size-2 shrink-0 rounded-full bg-foreground"
        aria-label="unsaved changes"
        title="unsaved changes"
      />
    )
  }

  // show spinner until resolved
  if (state === "ExternalChange") {
    return <Loader2 className="h-3 w-3 mr-1 animate-spin" />
  }

  if (state === "Conflict") {
    return (
      <FileWarning
        className="ml-auto size-3 shrink-0"
        aria-label="file has conflicting changes"
      />
    )
  }

  return null
}

export interface TreeRowProps {
  flatItem: FlatTreeItem
  onFileClick: (filePath: AbsolutePath) => void
  onFolderToggle: (folderPath: Folder["path"]) => void
  onStartRename: (item: File | Folder) => void
  onStartDelete: (item: File | Folder) => void
  onCreateFile: (filePath: AbsolutePath) => void
  onCreateFolder: (folderPath: string) => void
  selectedFilePath?: AbsolutePath | null
  editingItem: {
    type: "create" | "rename"
    path: string
    value: string
    originalValue?: string
  } | null
  setEditingItem: (
    item: {
      type: "create" | "rename"
      path: string
      value: string
      originalValue?: string
    } | null
  ) => void
  onRename: () => void
  onRenameKeyDown: (e: React.KeyboardEvent) => void
  onCancelRename: () => void
  onRenameInputChange: (value: string) => void
  validationError?: string | null
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  workspace: WorkspaceInfo
  style?: React.CSSProperties
}

/**
 * TreeRow renders a single item in the virtualized file tree.
 * Handles both files and folders with proper indentation based on depth.
 */
export function TreeRow({
  flatItem,
  onFileClick: _onFileClick,
  onFolderToggle,
  onStartRename,
  onStartDelete,
  onCreateFile,
  onCreateFolder,
  selectedFilePath,
  editingItem,
  setEditingItem: _setEditingItem,
  onRename: _onRename,
  onRenameKeyDown,
  onCancelRename,
  onRenameInputChange,
  validationError,
  onExpandFolder,
  workspace,
  style,
}: TreeRowProps) {
  const { item, depth, isExpanded, hasChildren: _hasChildren } = flatItem
  const filePath = item.path

  const isSelected = selectedFilePath === filePath
  const isRenaming = editingItem?.path === filePath
  const isGitIgnored = item.isGitIgnored

  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  )
  const [contextItemName, setContextItemName] = useAtom(contextItemNameAtom)

  const isCreatingInThisContext = isCreatingInContext?.parentPath === filePath

  const handleContextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (isCreatingInContext?.kind === "file") {
        onCreateFile(AbsolutePath(isCreatingInContext.parentPath))
      } else if (isCreatingInContext?.kind === "folder") {
        onCreateFolder(isCreatingInContext.parentPath)
      }
    } else if (e.key === "Escape") {
      setIsCreatingInContext(null)
      setContextItemName("")
    }
  }

  // Base indentation per level (in pixels)
  const indentPx = depth * 12

  const { cacheMap } = useWorkspaceCache(workspace.path)

  if (item.kind === "file") {
    const filePathEncoded = encodeBase64Url(AbsolutePath(filePath))
    const workspaceIdEncoded = workspace?.path
      ? encodeBase64Url(workspace.path)
      : ""

    const canToggleViews = supportedViews(item.fileType).size > 1
    const cacheEntry = cacheMap.get(item.path)
    const view =
      cacheEntry?.view_kind ?? (canToggleViews ? undefined : "source")
    const editorId = cacheEntry?.editorId ?? undefined
    const cached = cacheMap.has(item.path)

    return (
      <SidebarMenuItem
        style={{
          ...style,
          paddingLeft: `${indentPx}px`,
        }}
        className={isGitIgnored ? "opacity-50" : undefined}
      >
        {isRenaming ? (
          <RenameInput
            value={editingItem.value}
            onChange={onRenameInputChange}
            onKeyDown={onRenameKeyDown}
            validationError={validationError}
          />
        ) : (
          <Link
            to="/w/$workspaceId/f/$filePath"
            params={{
              workspaceId: workspaceIdEncoded,
              filePath: filePathEncoded,
            }}
            search={{ view, editorId }}
            className="w-full"
          >
            <SidebarMenuButton
              isActive={isSelected}
              onClick={() => {}}
              className="cursor-pointer"
            >
              {React.createElement(getNavItemIcon(item))}
              <span className="truncate">{item.name}</span>
              {cached && <FileStatusIndicator filePath={item.path} />}
            </SidebarMenuButton>
          </Link>
        )}
        <ItemDropdownMenu
          item={item}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          isRenaming={isRenaming}
          onExpandFolder={onExpandFolder}
        />
        {isRenaming && <CancelRenameButton onCancel={onCancelRename} />}
      </SidebarMenuItem>
    )
  }

  // Folder
  return (
    <>
      <SidebarMenuItem
        style={{
          ...style,
          paddingLeft: `${indentPx}px`,
        }}
        className={isGitIgnored ? "opacity-50" : undefined}
      >
        {isRenaming ? (
          <RenameInput
            value={editingItem.value}
            onChange={onRenameInputChange}
            onKeyDown={onRenameKeyDown}
            validationError={validationError}
          />
        ) : (
          <SidebarMenuButton
            isActive={isSelected}
            onClick={() => onFolderToggle(filePath)}
            className="cursor-pointer"
          >
            <ChevronRight
              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            {React.createElement(getNavItemIcon(item))}
            <span className="truncate">{item.name}</span>
          </SidebarMenuButton>
        )}
        <ItemDropdownMenu
          item={item}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          isRenaming={isRenaming}
          onExpandFolder={onExpandFolder}
        />
        {isRenaming && <CancelRenameButton onCancel={onCancelRename} />}
      </SidebarMenuItem>

      {/* Inline creation input - shown after the folder item when creating inside it */}
      {isCreatingInThisContext && (
        <SidebarMenuItem
          style={{
            paddingLeft: `${indentPx + 12}px`,
          }}
        >
          <SidebarMenuButton className="cursor-default">
            <Input
              placeholder={
                isCreatingInContext.kind === "file"
                  ? "filename.txt"
                  : "folder name"
              }
              value={contextItemName}
              onChange={(e) => setContextItemName(e.target.value)}
              onKeyDown={handleContextKeyDown}
              className="h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </>
  )
}
