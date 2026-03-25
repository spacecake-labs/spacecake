import { Link } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronRight, Loader2, Plus, X } from "lucide-react"
import { useEffect, useRef } from "react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useStartCreating } from "@/hooks/use-start-creating"
import type { WorkspaceCache } from "@/hooks/use-workspace-cache"
import {
  contextItemNameAtom,
  isCreatingInContextAtom,
  lastClickedTreeItemAtom,
} from "@/lib/atoms/atoms"
import type { FlatFileTreeItem } from "@/lib/atoms/file-tree"
import { getFileStateAtom, hasFileStateAtom } from "@/lib/atoms/file-tree"
import { supportedViews } from "@/lib/language-support"
import { cn, encodeBase64Url, toRelativePath } from "@/lib/utils"
import { getNavItemIcon } from "@/lib/workspace"
import { AbsolutePath, File, Folder, WorkspaceInfo } from "@/types/workspace"

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
      // Intentionally omit 'value' from deps to avoid re-selecting text on every keystroke
      const lastDotIndex = value.lastIndexOf(".")
      const selectEnd = lastDotIndex > 0 ? lastDotIndex : value.length
      inputRef.current.setSelectionRange(0, selectEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="px-3 py-1 text-xs text-destructive">{validationError}</div>
      )}
    </div>
  )
}

/** renders the revert menu item only when the file has state and is dirty.
 *  only mounted when hasFileStateAtom is true (guarded in ItemContextMenu). */
function RevertMenuItem({
  item,
  onStartRevert,
}: {
  item: File
  onStartRevert: (item: File) => void
}) {
  const atom = getFileStateAtom(item.path)
  const fileState = useAtomValue(atom!)
  if (fileState.value !== "Dirty") return null
  return (
    <ContextMenuItem onClick={() => onStartRevert(item)}>
      <span>revert</span>
    </ContextMenuItem>
  )
}

// Component for the context menu (for files and folders)
function ItemContextMenu({
  item,
  onStartRename,
  onStartDelete,
  onStartRevert,
  onExpandFolder,
  workspace,
  children,
}: {
  item: File | Folder
  onStartRename: (item: File | Folder) => void
  onStartDelete: (item: File | Folder) => void
  onStartRevert?: (item: File) => void
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  workspace: WorkspaceInfo
  children: React.ReactNode
}) {
  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  const itemPath = item.path
  const isItemFolder = item.kind === "folder"
  const isFile = item.kind === "file"
  const showRevert = isFile && hasFileStateAtom(item.path as AbsolutePath) && onStartRevert

  const startCreatingFile = () => {
    setIsCreatingInContext({ kind: "file", parentPath: itemPath })
    setContextItemName("")

    if (isItemFolder && onExpandFolder) {
      onExpandFolder(itemPath, true)
    }
  }

  const startCreatingFolder = () => {
    setIsCreatingInContext({ kind: "folder", parentPath: itemPath })
    setContextItemName("")

    if (isItemFolder && onExpandFolder) {
      onExpandFolder(itemPath, true)
    }
  }

  const copyPath = async () => {
    await navigator.clipboard.writeText(itemPath)
  }

  const copyRelativePath = async () => {
    const relativePath = toRelativePath(AbsolutePath(workspace.path), AbsolutePath(itemPath))
    await navigator.clipboard.writeText(relativePath)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {isItemFolder && (
          <>
            <ContextMenuItem onClick={startCreatingFile}>
              <span>new file</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={startCreatingFolder}>
              <span>new folder</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={copyPath}>
          <span>copy path</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={copyRelativePath}>
          <span>copy relative path</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onStartRename(item)}>
          <span>rename</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onStartDelete(item)}>
          <span>delete</span>
        </ContextMenuItem>
        {showRevert && <RevertMenuItem item={item as File} onStartRevert={onStartRevert} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Component for the workspace-level dropdown menu (plus icon)
export function WorkspaceDropdownMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)
  const startCreating = useStartCreating(workspace?.path)

  const cancelCreating = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  const isCreatingInWorkspace = isCreatingInContext !== null

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
            <DropdownMenuItem onClick={() => startCreating("file")}>
              <span>new file</span>
              <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startCreating("folder")}>
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

/** renders a file row with state-aware styling (dirty/conflict indicators) */
function FileRowLinkWithState({
  item,
  workspace,
  isSelected,
  cacheMap,
}: {
  item: File
  workspace: WorkspaceInfo
  isSelected: boolean
  cacheMap: WorkspaceCache
}) {
  const state = useAtomValue(getFileStateAtom(item.path)!).value
  const statusText = state === "Dirty" ? "dirty" : state === "Conflict" ? "conflict" : "clean"
  const title = `${item.name} (${statusText})`

  const filePathEncoded = encodeBase64Url(AbsolutePath(item.path))
  const workspaceIdEncoded = workspace?.path ? encodeBase64Url(workspace.path) : ""

  const canToggleViews = supportedViews(item.fileType).size > 1
  const cacheEntry = cacheMap.get(item.path)
  const view = cacheEntry?.view_kind ?? (canToggleViews ? undefined : "source")
  const editorId = cacheEntry?.editorId ?? undefined
  const cached = cacheMap.has(item.path)

  const Icon = getNavItemIcon(item)
  const iconClass =
    state === "Dirty" ? "text-warning" : state === "Conflict" ? "text-destructive" : ""

  return (
    <Link
      to="/w/$workspaceId/f/$filePath"
      params={{
        workspaceId: workspaceIdEncoded,
        filePath: filePathEncoded,
      }}
      search={{ view, editorId }}
      className="w-full"
      title={title}
      draggable={false}
    >
      <SidebarMenuButton isActive={isSelected} className="cursor-pointer">
        <Icon className={iconClass} />
        <span className="truncate">{item.name}</span>
        {cached && state === "ExternalChange" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      </SidebarMenuButton>
    </Link>
  )
}

/** renders a file row with default clean appearance (no atom subscription) */
function FileRowLinkClean({
  item,
  workspace,
  isSelected,
  cacheMap,
}: {
  item: File
  workspace: WorkspaceInfo
  isSelected: boolean
  cacheMap: WorkspaceCache
}) {
  const title = `${item.name} (clean)`

  const filePathEncoded = encodeBase64Url(AbsolutePath(item.path))
  const workspaceIdEncoded = workspace?.path ? encodeBase64Url(workspace.path) : ""

  const canToggleViews = supportedViews(item.fileType).size > 1
  const cacheEntry = cacheMap.get(item.path)
  const view = cacheEntry?.view_kind ?? (canToggleViews ? undefined : "source")
  const editorId = cacheEntry?.editorId ?? undefined

  const Icon = getNavItemIcon(item)

  return (
    <Link
      to="/w/$workspaceId/f/$filePath"
      params={{
        workspaceId: workspaceIdEncoded,
        filePath: filePathEncoded,
      }}
      search={{ view, editorId }}
      className="w-full"
      title={title}
      draggable={false}
    >
      <SidebarMenuButton isActive={isSelected} className="cursor-pointer">
        <Icon />
        <span className="truncate">{item.name}</span>
      </SidebarMenuButton>
    </Link>
  )
}

function FileRowLink({
  item,
  workspace,
  isSelected,
  cacheMap,
}: {
  item: File
  workspace: WorkspaceInfo
  isSelected: boolean
  cacheMap: WorkspaceCache
}) {
  if (hasFileStateAtom(item.path as AbsolutePath)) {
    return (
      <FileRowLinkWithState
        item={item}
        workspace={workspace}
        isSelected={isSelected}
        cacheMap={cacheMap}
      />
    )
  }
  return (
    <FileRowLinkClean
      item={item}
      workspace={workspace}
      isSelected={isSelected}
      cacheMap={cacheMap}
    />
  )
}

// Component for the cancel creating button
function CreateCancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <SidebarMenuAction className="cursor-pointer" onClick={onCancel}>
      <X className="h-3 w-3" />
      <span className="sr-only">cancel</span>
    </SidebarMenuAction>
  )
}

export interface TreeRowProps {
  flatItem: FlatFileTreeItem
  onFileClick: (filePath: AbsolutePath) => void
  onFolderToggle: (folderPath: Folder["path"]) => void
  onStartRename: (item: File | Folder) => void
  onStartDelete: (item: File | Folder) => void
  onStartRevert?: (item: File) => void
  onCreateFile: (name: string) => void
  onCreateFolder: (name: string) => void
  isCreatingInThisContext: boolean
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
    } | null,
  ) => void
  onRename: () => void
  onRenameKeyDown: (e: React.KeyboardEvent) => void
  onCancelRename: () => void
  onRenameInputChange: (value: string) => void
  validationError?: string | null
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  workspace: WorkspaceInfo
  cacheMap: WorkspaceCache
  style?: React.CSSProperties
}

function areTreeRowPropsEqual(prev: TreeRowProps, next: TreeRowProps): boolean {
  // fast path: wrapper reference preserved by intern cache
  if (prev.flatItem !== next.flatItem) {
    const pi = prev.flatItem
    const ni = next.flatItem
    if (pi.item.path !== ni.item.path) return false
    if (pi.item.name !== ni.item.name) return false
    if (pi.item.kind !== ni.item.kind) return false
    if (pi.item.isGitIgnored !== ni.item.isGitIgnored) return false
    if (pi.depth !== ni.depth) return false
    if (pi.isExpanded !== ni.isExpanded) return false
    if (pi.hasChildren !== ni.hasChildren) return false
    if (pi.item.kind === "file" && ni.item.kind === "file") {
      if (pi.item.cid !== ni.item.cid) return false
      if (pi.item.fileType !== ni.item.fileType) return false
    }
    if (pi.item.kind === "folder" && ni.item.kind === "folder") {
      if (pi.item.isSystemFolder !== ni.item.isSystemFolder) return false
    }
  }

  if (prev.selectedFilePath !== next.selectedFilePath) return false
  if (prev.isCreatingInThisContext !== next.isCreatingInThisContext) return false

  // editingItem: only compare whether *this* row is being edited
  const path = prev.flatItem.item.path
  const prevEditing = prev.editingItem?.path === path
  const nextEditing = next.editingItem?.path === path
  if (prevEditing !== nextEditing) return false
  if (prevEditing && nextEditing) {
    if (prev.editingItem!.value !== next.editingItem!.value) return false
    if (prev.validationError !== next.validationError) return false
  }

  // cacheMap: only compare this row's entry (files only)
  if (prev.flatItem.item.kind === "file") {
    const pe = prev.cacheMap.get(path)
    const ne = next.cacheMap.get(path)
    if (pe !== ne) {
      if (!pe || !ne) return false
      if (pe.view_kind !== ne.view_kind) return false
      if (pe.editorId !== ne.editorId) return false
      if (pe.has_cached_state !== ne.has_cached_state) return false
    }
  }

  return true
}

/**
 * TreeRow renders a single item in the virtualized file tree.
 * Handles both files and folders with proper indentation based on depth.
 */
export const TreeRow = React.memo(function TreeRow({
  flatItem,
  onFileClick: _onFileClick,
  onFolderToggle,
  onStartRename,
  onStartDelete,
  onStartRevert,
  onCreateFile: _onCreateFile,
  onCreateFolder: _onCreateFolder,
  isCreatingInThisContext,
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
  cacheMap,
  style,
}: TreeRowProps) {
  const { item, depth, isExpanded, hasChildren: _hasChildren } = flatItem
  const filePath = item.path
  const setLastClicked = useSetAtom(lastClickedTreeItemAtom)

  const isSelected = selectedFilePath === filePath
  const isRenaming = editingItem?.path === filePath
  const isGitIgnored = item.isGitIgnored

  // Base indentation per level (in pixels)
  const indentPx = depth * 12

  if (item.kind === "file") {
    const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
    const setContextItemName = useSetAtom(contextItemNameAtom)

    const handleCancelCreating = () => {
      setIsCreatingInContext(null)
      setContextItemName("")
    }

    return (
      <ItemContextMenu
        item={item}
        onStartRename={onStartRename}
        onStartDelete={onStartDelete}
        onStartRevert={onStartRevert}
        onExpandFolder={onExpandFolder}
        workspace={workspace}
      >
        <SidebarMenuItem
          onClick={() =>
            setLastClicked((prev) =>
              prev?.path === filePath && prev.kind === "file"
                ? prev
                : { path: filePath, kind: "file" },
            )
          }
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
            <FileRowLink
              item={item}
              workspace={workspace}
              isSelected={isSelected}
              cacheMap={cacheMap}
            />
          )}
          {isCreatingInThisContext && <CreateCancelButton onCancel={handleCancelCreating} />}
          {isRenaming && <CancelRenameButton onCancel={onCancelRename} />}
        </SidebarMenuItem>
      </ItemContextMenu>
    )
  }

  // Folder
  const isSystemFolder = item.kind === "folder" && item.isSystemFolder
  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  const handleCancelCreating = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  return (
    <ItemContextMenu
      item={item}
      onStartRename={onStartRename}
      onStartDelete={onStartDelete}
      onStartRevert={onStartRevert}
      onExpandFolder={onExpandFolder}
      workspace={workspace}
    >
      <SidebarMenuItem
        onClick={() =>
          setLastClicked((prev) =>
            prev?.path === filePath && prev.kind === "folder"
              ? prev
              : { path: filePath, kind: "folder" },
          )
        }
        style={{
          ...style,
          paddingLeft: `${indentPx}px`,
        }}
        className={cn(isGitIgnored && "opacity-50", isSystemFolder && "text-muted-foreground")}
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
            <ChevronRight className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            {React.createElement(getNavItemIcon(item))}
            <span className="truncate">{item.name}</span>
          </SidebarMenuButton>
        )}
        {isCreatingInThisContext && <CreateCancelButton onCancel={handleCancelCreating} />}
        {isRenaming && <CancelRenameButton onCancel={onCancelRename} />}
      </SidebarMenuItem>
    </ItemContextMenu>
  )
}, areTreeRowPropsEqual)
