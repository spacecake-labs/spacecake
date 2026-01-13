import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { FileWarning, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { match } from "@/types/adt"
import type { File, Folder, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"
import {
  contextItemNameAtom,
  deletionStateAtom,
  editingItemAtom,
  isCreatingInContextAtom,
} from "@/lib/atoms/atoms"
import { flatVisibleTreeAtom, sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { createFolder, remove, rename, saveFile } from "@/lib/fs"
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceCache } from "@/hooks/use-workspace-cache"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { TreeRow, WorkspaceDropdownMenu } from "@/components/workspace-tree"

interface NavMainProps {
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  onFileClick?: (filePath: AbsolutePath) => void
  selectedFilePath?: AbsolutePath | null
  workspace: WorkspaceInfo
}

function CreationInput({
  kind,
  onCreateFile,
  onCreateFolder,
  onCancel,
}: {
  kind: "file" | "folder"
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onCancel: () => void
}) {
  const [contextItemName, setContextItemName] = useAtom(contextItemNameAtom)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (kind === "file") {
        onCreateFile(contextItemName)
      } else {
        onCreateFolder(contextItemName)
      }
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <SidebarMenuButton className="cursor-default">
      <Input
        placeholder={kind === "file" ? "filename.txt" : "folder name"}
        value={contextItemName}
        onChange={(e) => setContextItemName(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        autoFocus
      />
    </SidebarMenuButton>
  )
}

export function NavMain({
  onExpandFolder,
  onFileClick,
  selectedFilePath: initialSelectedFilePath,
  workspace,
}: NavMainProps) {
  const [editingItem, setEditingItem] = useAtom(editingItemAtom)
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  )
  // Removed global subscription to contextItemNameAtom here
  const setContextItemName = useSetAtom(contextItemNameAtom)
  const [deletionState, setDeletionState] = useAtom(deletionStateAtom)

  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // Validation state for rename
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  )

  const sortedFileTree = useAtomValue(sortedFileTreeAtom)
  const flatVisibleTree = useAtomValue(flatVisibleTreeAtom)

  // Ref for the scrollable container
  const parentRef = React.useRef<HTMLDivElement>(null)

  // Virtualizer for the flattened tree
  const rowVirtualizer = useVirtualizer({
    count: flatVisibleTree.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // Estimated row height
    overscan: 10,
  })

  const { cacheMap } = useWorkspaceCache(workspace.path)

  const isCreatingInWorkspace =
    isCreatingInContext?.parentPath === workspace?.path

  const handleCreateFile = React.useCallback(
    async (name: string) => {
      const parentPath = isCreatingInContext!.parentPath
      const filePath = AbsolutePath(`${parentPath}/${name.trim()}`)
      const result = await saveFile(filePath, "")

      match(result, {
        onLeft: (error) => {
          console.error("error creating file:", error)
        },
        onRight: () => {
          setIsCreatingInContext(null)
          setContextItemName("")
          if (onFileClick) onFileClick(filePath)
        },
      })
    },
    [
      isCreatingInContext,
      onFileClick,
      setContextItemName,
      setIsCreatingInContext,
    ]
  )

  const handleCreateFolder = React.useCallback(
    async (name: string) => {
      const parentPath = isCreatingInContext!.parentPath
      const folderPath = AbsolutePath(`${parentPath}/${name.trim()}`)
      const result = await createFolder(folderPath)

      match(result, {
        onLeft: (error) => {
          console.error("error creating folder:", error)
        },
        onRight: () => {
          setIsCreatingInContext(null)
          setContextItemName("")
        },
      })
    },
    [isCreatingInContext, setContextItemName, setIsCreatingInContext]
  )

  // Validate rename target - memoized
  const validateRenameTarget = React.useCallback(
    (
      newName: string,
      currentPath: string,
      originalName: string
    ): string | null => {
      if (!newName.trim()) return "name cannot be empty"
      if (newName.trim() === originalName) return null

      const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"))
      const newPath = `${currentDir}/${newName.trim()}`

      const existingFile = sortedFileTree.find(
        (f: File | Folder) => f.path === newPath
      )
      if (existingFile) {
        return `'${newName.trim()}' already exists`
      }
      return null
    },
    [sortedFileTree]
  )

  const handleFileClickCallback = React.useCallback(
    (filePath: AbsolutePath) => {
      if (onFileClick) {
        onFileClick(filePath)
      }
    },
    [onFileClick]
  )

  const handleFolderToggleCallback = React.useCallback(
    (folderPath: Folder["path"]) => {
      if (onExpandFolder) {
        onExpandFolder(folderPath)
      }
    },
    [onExpandFolder]
  )

  const handleStartRenameCallback = React.useCallback(
    (item: File | Folder) => {
      if (item.kind === "file" || item.kind === "folder") {
        setEditingItem({
          type: "rename",
          path: item.path,
          value: item.name,
          originalValue: item.name,
        })
        setValidationError(null)
      }
    },
    [setEditingItem]
  )

  const handleRenameCallback = React.useCallback(async () => {
    if (!editingItem || !workspace?.path) return

    const oldPath = editingItem.path
    const newName = editingItem.value.trim()

    if (!newName) {
      setEditingItem(null)
      return
    }

    if (newName === editingItem.originalValue) {
      setEditingItem(null)
      setValidationError(null)
      return
    }

    const error = validateRenameTarget(
      newName,
      oldPath,
      editingItem.originalValue || ""
    )
    if (error) {
      setValidationError(error)
      return
    }

    const pathParts = oldPath.split("/")
    pathParts.pop()
    const newPath =
      pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName

    const result = await rename(AbsolutePath(oldPath), AbsolutePath(newPath))

    match(result, {
      onLeft: (error) => {
        console.error(error)
        setValidationError("error renaming file")
      },
      onRight: () => {
        if (selectedFilePath === oldPath) {
          handleFileClickCallback(AbsolutePath(newPath))
        }
        setEditingItem(null)
        setValidationError(null)
      },
    })
  }, [
    editingItem,
    workspace,
    validateRenameTarget,
    selectedFilePath,
    handleFileClickCallback,
    setEditingItem,
  ])

  const handleRenameKeyDownCallback = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameCallback()
      } else if (e.key === "Escape") {
        setEditingItem(null)
      }
    },
    [handleRenameCallback, setEditingItem]
  )

  const cancelRenameCallback = React.useCallback(() => {
    setEditingItem(null)
    setValidationError(null)
  }, [setEditingItem])

  const handleRenameInputChangeCallback = React.useCallback(
    (value: string) => {
      // NOTE: We cannot simply use `editingItem` from closure if we want this callback to be stable
      // But `setEditingItem` with functional update handles the "current" state.
      // HOWEVER, we need the `path` and `originalValue` from `editingItem` to validate.
      // So this callback MUST depend on `editingItem` or we use a ref.
      // If it depends on `editingItem`, it changes on every keystroke, defeating memoization for the ROW being renamed.
      // But other rows are fine.

      // Actually, we can just let this one change. Only the row being renamed will re-render, which is fine/required.
      // But we should check if `editingItem` being in dependency array breaks other rows?
      // Yes, if we pass this function to ALL rows.
      // But `TreeRow` only uses it if it's the one being edited?
      // No, `TreeRow` receives `onRenameInputChange`.
      // If `handleRenameInputChangeCallback` changes, ALL rows re-render.
      // We should use a functional update or a ref to avoid this dependency if possible,
      // OR only pass it to the row that needs it? No, virtual list.

      // Better approach:
      // `editingItem` is global atom state.
      // The `TreeRow` can read it directly? No, we passed it as prop.
      // Let's stick to standard pattern: `NavMain` re-renders on rename input.
      // Is that bad?
      // When renaming, we are typing. We don't want the WHOLE TREE to re-render.
      // `editingItem` changes -> `NavMain` re-renders -> new `handleRenameInputChangeCallback` -> ALL rows re-render.
      // To fix this, we need `handleRenameInputChangeCallback` to be stable.
      // But it needs access to `editingItem`.
      // We can use a Ref to store the latest `editingItem` without triggering re-render,
      // but `NavMain` re-renders anyway because of `useAtom(editingItemAtom)`.

      // So `NavMain` re-rendering is unavoidable with current atom structure unless we move rename state down.
      // But rename state IS global (only one item renamed at a time).

      // ACCEPTABLE TRADEOFF: Renaming is rare.
      // The critical path is **Creating a file** (typing name) and **Expanding folders**.
      // This fix solves the "Creating File" re-renders (by extracting Input) and "Expanding Folder" re-renders (by memoizing rows).
      // I will leave Rename optimization for later if needed.

      if (editingItem) {
        // using the variable from closure
        setEditingItem((prev) => (prev ? { ...prev, value } : null))

        // Validation needs state.
        const error = validateRenameTarget(
          value,
          editingItem.path,
          editingItem.originalValue || ""
        )
        setValidationError(error)
      }
    },
    [editingItem, setEditingItem, validateRenameTarget]
  )

  const handleStartDeleteCallback = React.useCallback(
    (item: File | Folder) => {
      setDeletionState({ item, isOpen: true, isDeleting: false })
    },

    [setDeletionState]
  )

  const handleConfirmDelete = async () => {
    if (!deletionState.item || !workspace?.path) return

    // prevent deletion of system folders
    if (
      deletionState.item.kind === "folder" &&
      deletionState.item.isSystemFolder
    ) {
      toast.error("system folders cannot be deleted")
      setDeletionState({ item: null, isOpen: false, isDeleting: false })
      return
    }

    setDeletionState((prev) => ({ ...prev, isDeleting: true }))

    const itemToDelete = deletionState.item
    const result = await remove(
      AbsolutePath(itemToDelete.path),
      deletionState.item.kind === "folder"
    )

    match(result, {
      onLeft: (error) => {
        console.error(error)
        setDeletionState((prev) => ({ ...prev, isDeleting: false }))
      },
      onRight: async () => {
        setDeletionState({
          item: null,
          isOpen: false,
          isDeleting: false,
        })
      },
    })
  }

  const handleCancelDelete = () => {
    setDeletionState({ item: null, isOpen: false, isDeleting: false })
  }

  const handleCancelCreation = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  return (
    <>
      <SidebarGroup className="flex flex-col h-full overflow-hidden">
        <SidebarGroupLabel className="flex items-center justify-between shrink-0">
          {<span>{workspace?.path.split("/").pop() ?? "workspace"}</span>}
          {workspace?.path && <WorkspaceDropdownMenu workspace={workspace} />}
        </SidebarGroupLabel>

        <div
          ref={parentRef}
          className="flex-1 overflow-auto"
          style={{ contain: "strict" }}
        >
          <SidebarMenu>
            {isCreatingInWorkspace && workspace?.path && (
              <SidebarMenuItem>
                <CreationInput
                  kind={isCreatingInContext.kind}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onCancel={handleCancelCreation}
                />
              </SidebarMenuItem>
            )}

            {/* Virtualized tree rendering */}
            {workspace?.path && flatVisibleTree.length > 0 && (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const flatItem = flatVisibleTree[virtualItem.index]
                  const itemKey =
                    flatItem.item.kind === "creation-input"
                      ? `creation-input-${flatItem.item.parentPath}`
                      : flatItem.item.path

                  // Render creation input as a separate row
                  if (flatItem.item.kind === "creation-input") {
                    const indentPx = flatItem.depth * 12
                    return (
                      <div
                        key={itemKey}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <SidebarMenuItem
                          style={{ paddingLeft: `${indentPx}px` }}
                        >
                          <CreationInput
                            kind={flatItem.item.creationKind}
                            onCreateFile={handleCreateFile}
                            onCreateFolder={handleCreateFolder}
                            onCancel={handleCancelCreation}
                          />
                        </SidebarMenuItem>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={itemKey}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <TreeRow
                        flatItem={flatItem}
                        onFileClick={handleFileClickCallback}
                        onFolderToggle={handleFolderToggleCallback}
                        onStartRename={handleStartRenameCallback}
                        onStartDelete={handleStartDeleteCallback}
                        onCreateFile={handleCreateFile}
                        onCreateFolder={handleCreateFolder}
                        selectedFilePath={initialSelectedFilePath}
                        editingItem={editingItem}
                        setEditingItem={setEditingItem}
                        onRename={handleRenameCallback}
                        onRenameKeyDown={handleRenameKeyDownCallback}
                        onCancelRename={cancelRenameCallback}
                        onRenameInputChange={handleRenameInputChangeCallback}
                        validationError={validationError}
                        onExpandFolder={onExpandFolder}
                        workspace={workspace}
                        cacheMap={cacheMap}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Empty state when workspace has no files/folders */}
            {workspace?.path && !flatVisibleTree.length && (
              <SidebarMenuItem>
                <SidebarMenuButton className="cursor-default">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileWarning className="h-3 w-3" />
                    <span>empty</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </div>
      </SidebarGroup>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deletionState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeletionState({
              item: null,
              isOpen: false,
              isDeleting: false,
            })
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deletionState.item && deletionState.item.kind === "folder"
                ? "delete folder"
                : "delete file"}
            </DialogTitle>
            <DialogDescription>
              are you sure you want to delete '
              {deletionState.item &&
              (deletionState.item.kind === "file" ||
                deletionState.item.kind === "folder")
                ? deletionState.item.name
                : ""}
              '
              {deletionState.item && deletionState.item.kind === "folder"
                ? " and its contents"
                : ""}
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deletionState.isDeleting}
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletionState.isDeleting}
            >
              {deletionState.isDeleting ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  deleting...
                </>
              ) : (
                "delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
