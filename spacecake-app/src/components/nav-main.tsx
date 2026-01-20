import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { FileWarning, Loader2Icon, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { match } from "@/types/adt"
import type { File, Folder, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"
import {
  contextItemNameAtom,
  deletionStateAtom,
  editingItemAtom,
  isCreatingInContextAtom,
  revertStateAtom,
} from "@/lib/atoms/atoms"
import {
  fileStateAtomFamily,
  flatVisibleTreeAtom,
  sortedFileTreeAtom,
  type FlatFileTreeItem,
} from "@/lib/atoms/file-tree"
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
  const [revertState, setRevertState] = useAtom(revertStateAtom)

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
        // Only close the dialog - keep isDeleting true during close animation
        // The onOpenChange handler will clean up the full state after animation completes
        setDeletionState((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  const handleCancelDelete = () => {
    setDeletionState({ item: null, isOpen: false, isDeleting: false })
  }

  const handleStartRevertCallback = React.useCallback(
    (item: File) => {
      setRevertState({
        filePath: AbsolutePath(item.path),
        fileName: item.name,
        isOpen: true,
        isReverting: false,
      })
    },
    [setRevertState]
  )

  const store = useStore()

  const handleConfirmRevert = () => {
    if (!revertState.isOpen) return
    setRevertState({ ...revertState, isReverting: true })
    // Use store.set directly to ensure we target the correct file's state machine
    store.set(fileStateAtomFamily(revertState.filePath), {
      type: "file.revert",
    })
    setTimeout(() => {
      setRevertState({ isOpen: false })
    }, 150)
  }

  const handleCancelRevert = () => {
    setRevertState({ isOpen: false })
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
                        flatItem={flatItem as FlatFileTreeItem}
                        onFileClick={handleFileClickCallback}
                        onFolderToggle={handleFolderToggleCallback}
                        onStartRename={handleStartRenameCallback}
                        onStartDelete={handleStartDeleteCallback}
                        onStartRevert={handleStartRevertCallback}
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
            // Delay state reset until after close animation completes
            // to keep isDeleting true during the fade-out
            setTimeout(() => {
              setDeletionState({
                item: null,
                isOpen: false,
                isDeleting: false,
              })
            }, 150)
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
              className="cursor-pointer"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletionState.isDeleting}
              className="cursor-pointer"
            >
              {deletionState.isDeleting ? (
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Confirmation Dialog */}
      <Dialog
        open={revertState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTimeout(() => {
              setRevertState({ isOpen: false })
            }, 150)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>revert file</DialogTitle>
            <DialogDescription>
              are you sure you want to revert '
              {revertState.isOpen ? revertState.fileName : ""}'?
              <br />
              all unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelRevert}
              disabled={revertState.isOpen && revertState.isReverting}
              className="cursor-pointer"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRevert}
              disabled={revertState.isOpen && revertState.isReverting}
              className="cursor-pointer"
            >
              {revertState.isOpen && revertState.isReverting ? (
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              revert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
