import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { FileWarning, Loader2Icon, RotateCcw, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { DraggableTreeRow } from "@/components/draggable-tree-row"
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
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceCache } from "@/hooks/use-workspace-cache"
import {
  contextItemNameAtom,
  deletionStateAtom,
  editingItemAtom,
  isCreatingInContextAtom,
  revertStateAtom,
} from "@/lib/atoms/atoms"
import {
  getOrCreateFileStateAtom,
  flatVisibleTreeAtom,
  sortedFileTreeAtom,
  type FlatFileTreeItem,
} from "@/lib/atoms/file-tree"
import { canDropItem } from "@/lib/drag-drop-validation"
import { findItemInTree } from "@/lib/file-event-handler"
import { createFolder, remove, saveFile } from "@/lib/fs"
import { moveOrRenameItem } from "@/lib/move-item"
import { match } from "@/types/adt"
import type { File, Folder, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

function DeleteConfirmDialog({ workspace }: { workspace: WorkspaceInfo }) {
  const [deletionState, setDeletionState] = useAtom(deletionStateAtom)

  const handleConfirmDelete = async () => {
    if (!deletionState.item || !workspace?.path) return

    // prevent deletion of system folders
    if (deletionState.item.kind === "folder" && deletionState.item.isSystemFolder) {
      toast.error("system folders cannot be deleted")
      setDeletionState({ item: null, isOpen: false, isDeleting: false })
      return
    }

    setDeletionState((prev) => ({ ...prev, isDeleting: true }))

    const itemToDelete = deletionState.item
    const result = await remove(
      AbsolutePath(itemToDelete.path),
      deletionState.item.kind === "folder",
    )

    match(result, {
      onLeft: (error) => {
        console.error(error)
        setDeletionState((prev) => ({ ...prev, isDeleting: false }))
      },
      onRight: async () => {
        setDeletionState((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  const handleCancelDelete = () => {
    setDeletionState({ item: null, isOpen: false, isDeleting: false })
  }

  return (
    <Dialog
      open={deletionState.isOpen}
      onOpenChange={(open) => {
        if (!open) {
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
            (deletionState.item.kind === "file" || deletionState.item.kind === "folder")
              ? deletionState.item.name
              : ""}
            '{deletionState.item && deletionState.item.kind === "folder" ? " and its contents" : ""}
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
  )
}

function RevertConfirmDialog() {
  const [revertState, setRevertState] = useAtom(revertStateAtom)
  const store = useStore()

  const handleConfirmRevert = () => {
    if (!revertState.isOpen) return
    setRevertState((prev) => (prev.isOpen ? { ...prev, isReverting: true } : prev))
    store.set(getOrCreateFileStateAtom(revertState.filePath), {
      type: "file.revert",
    })
    setTimeout(() => {
      setRevertState({ isOpen: false })
    }, 150)
  }

  const handleCancelRevert = () => {
    setRevertState({ isOpen: false })
  }

  return (
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
            are you sure you want to revert '{revertState.isOpen ? revertState.fileName : ""}'?
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
  )
}

interface NavMainProps {
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  onFileClick?: (filePath: AbsolutePath) => void
  selectedFilePath?: AbsolutePath | null
  workspace: WorkspaceInfo
}

const ROW_HEIGHT = 28

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
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(isCreatingInContextAtom)
  // Removed global subscription to contextItemNameAtom here
  const setContextItemName = useSetAtom(contextItemNameAtom)
  const setDeletionState = useSetAtom(deletionStateAtom)
  const setRevertState = useSetAtom(revertStateAtom)

  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // ref to always hold the latest selectedFilePath for async callbacks
  const selectedFilePathRef = React.useRef(selectedFilePath)
  selectedFilePathRef.current = selectedFilePath

  // Validation state for rename
  const [validationError, setValidationError] = React.useState<string | null>(null)

  const store = useStore()
  const flatVisibleTree = useAtomValue(flatVisibleTreeAtom)

  // Ref for the scrollable container
  const parentRef = React.useRef<HTMLDivElement>(null)

  // Virtualizer for the flattened tree
  const rowVirtualizer = useVirtualizer({
    count: flatVisibleTree.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const { cacheMap } = useWorkspaceCache()

  const isCreatingInWorkspace = isCreatingInContext?.parentPath === workspace?.path

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
    [isCreatingInContext, onFileClick, setContextItemName, setIsCreatingInContext],
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
    [isCreatingInContext, setContextItemName, setIsCreatingInContext],
  )

  // validate rename target - uses recursive tree lookup
  const validateRenameTarget = React.useCallback(
    (newName: string, currentPath: string, originalName: string): string | null => {
      if (!newName.trim()) return "name cannot be empty"
      if (newName.trim() === originalName) return null

      const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"))
      const newPath = `${currentDir}/${newName.trim()}`

      const sortedFileTree = store.get(sortedFileTreeAtom)
      const existing = findItemInTree(sortedFileTree, newPath)
      if (existing) {
        return `'${newName.trim()}' already exists`
      }
      return null
    },
    [store],
  )

  const handleFileClickCallback = React.useCallback(
    (filePath: AbsolutePath) => {
      if (onFileClick) {
        onFileClick(filePath)
      }
    },
    [onFileClick],
  )

  const handleFolderToggleCallback = React.useCallback(
    (folderPath: Folder["path"]) => {
      if (onExpandFolder) {
        onExpandFolder(folderPath)
      }
    },
    [onExpandFolder],
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
    [setEditingItem],
  )

  const handleRenameCallback = React.useCallback(async () => {
    const currentEditingItem = store.get(editingItemAtom)
    if (!currentEditingItem || !workspace?.path) return

    const oldPath = AbsolutePath(currentEditingItem.path)
    const newName = currentEditingItem.value.trim()

    if (!newName || newName === currentEditingItem.originalValue) {
      setEditingItem(null)
      setValidationError(null)
      return
    }

    const error = validateRenameTarget(newName, oldPath, currentEditingItem.originalValue || "")
    if (error) {
      setValidationError(error)
      return
    }

    const pathParts = oldPath.split("/")
    pathParts.pop()
    const newPath = AbsolutePath(pathParts.join("/") + "/" + newName)

    // determine file vs folder
    const sortedTree = store.get(sortedFileTreeAtom)
    const item = findItemInTree(sortedTree, oldPath)
    const isFolder = item?.kind === "folder"

    const result = await moveOrRenameItem({
      store,
      oldPath,
      newPath,
      isFolder: !!isFolder,
      navigate: handleFileClickCallback,
      selectedFilePath: selectedFilePathRef.current,
    })

    if (result.success) {
      setEditingItem(null)
      setValidationError(null)
    } else {
      setValidationError(result.error ?? "error renaming file")
    }
  }, [workspace, validateRenameTarget, handleFileClickCallback, setEditingItem, store])

  const handleRenameKeyDownCallback = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameCallback()
      } else if (e.key === "Escape") {
        setEditingItem(null)
      }
    },
    [handleRenameCallback, setEditingItem],
  )

  const cancelRenameCallback = React.useCallback(() => {
    setEditingItem(null)
    setValidationError(null)
  }, [setEditingItem])

  const handleRenameInputChangeCallback = React.useCallback(
    (value: string) => {
      const currentEditingItem = store.get(editingItemAtom)
      if (currentEditingItem) {
        setEditingItem((prev) => (prev ? { ...prev, value } : null))

        const error = validateRenameTarget(
          value,
          currentEditingItem.path,
          currentEditingItem.originalValue || "",
        )
        setValidationError(error)
      }
    },
    [store, setEditingItem, validateRenameTarget],
  )

  const handleStartDeleteCallback = React.useCallback(
    (item: File | Folder) => {
      setDeletionState({ item, isOpen: true, isDeleting: false })
    },

    [setDeletionState],
  )

  const handleStartRevertCallback = React.useCallback(
    (item: File) => {
      setRevertState({
        filePath: AbsolutePath(item.path),
        fileName: item.name,
        isOpen: true,
        isReverting: false,
      })
    },
    [setRevertState],
  )

  const handleCancelCreation = () => {
    setIsCreatingInContext(null)
    setContextItemName("")
  }

  // stable callback for auto-expanding folders during drag hover
  const handleDragExpandFolder = React.useCallback(
    (folderPath: AbsolutePath) => {
      if (onExpandFolder) {
        onExpandFolder(folderPath, true)
      }
    },
    [onExpandFolder],
  )

  // highlight overlay for drag-over feedback (spans the entire folder + children)
  const highlightOverlayRef = React.useRef<HTMLDivElement>(null)
  const flatVisibleTreeRef = React.useRef(flatVisibleTree)
  flatVisibleTreeRef.current = flatVisibleTree

  const handleHighlightFolder = React.useCallback((folderPath: string) => {
    const overlay = highlightOverlayRef.current
    if (!overlay) return

    const tree = flatVisibleTreeRef.current
    const folderIndex = tree.findIndex(
      (item) => item.item.kind === "folder" && item.item.path === folderPath,
    )
    if (folderIndex === -1) {
      overlay.style.display = "none"
      return
    }

    const folderDepth = tree[folderIndex].depth
    let lastIndex = folderIndex
    for (let i = folderIndex + 1; i < tree.length; i++) {
      if (tree[i].depth > folderDepth) {
        lastIndex = i
      } else {
        break
      }
    }

    const top = folderIndex * ROW_HEIGHT
    const height = (lastIndex - folderIndex + 1) * ROW_HEIGHT

    overlay.style.display = "block"
    overlay.style.top = `${top}px`
    overlay.style.height = `${height}px`
  }, [])

  const handleClearHighlight = React.useCallback(() => {
    const overlay = highlightOverlayRef.current
    if (overlay) overlay.style.display = "none"
  }, [])

  // monitor for drop events and execute moves
  React.useEffect(() => {
    return monitorForElements({
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        if (!target) return

        const sourcePath = source.data.path as AbsolutePath
        const sourceKind = source.data.kind as "file" | "folder"
        const targetPath = target.data.path as string
        const targetKind = target.data.kind as string

        let targetFolderPath: AbsolutePath

        if (targetKind === "folder") {
          targetFolderPath = targetPath as AbsolutePath
        } else if (targetKind === "file") {
          targetFolderPath = targetPath.substring(0, targetPath.lastIndexOf("/")) as AbsolutePath
        } else if (targetKind === "root-drop-target") {
          targetFolderPath = workspace.path as AbsolutePath
        } else {
          return
        }

        const currentTree = store.get(sortedFileTreeAtom)
        const validation = canDropItem(sourcePath, sourceKind, targetFolderPath, currentTree)
        if (!validation.valid) return

        const sourceName = sourcePath.split("/").pop()!
        const newPath = AbsolutePath(`${targetFolderPath}/${sourceName}`)
        const isFolder = sourceKind === "folder"

        moveOrRenameItem({
          store,
          oldPath: sourcePath,
          newPath,
          isFolder,
          navigate: handleFileClickCallback,
          selectedFilePath: selectedFilePathRef.current,
        }).then((result) => {
          if (!result.success) {
            toast.error(result.error ?? "failed to move item")
          }
        })
      },
    })
  }, [workspace.path, store, handleFileClickCallback])

  // root-level drop target for empty space below all rows
  const rootDropRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = rootDropRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const sourcePath = source.data.path as string
        const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf("/"))
        return sourceParent !== workspace.path
      },
      getData: () => ({ kind: "root-drop-target" }),
      onDrag: () => {
        // highlight the entire tree (all rows from index 0 to end)
        const overlay = highlightOverlayRef.current
        if (!overlay) return
        overlay.style.display = "block"
        overlay.style.top = "0px"
        overlay.style.height = `${flatVisibleTreeRef.current.length * ROW_HEIGHT}px`
      },
      onDragLeave: () => {
        handleClearHighlight()
      },
      onDrop: () => {
        handleClearHighlight()
      },
    })
  }, [workspace.path, handleClearHighlight])

  return (
    <>
      <SidebarGroup className="flex flex-col h-full overflow-hidden">
        <SidebarGroupLabel className="flex items-center justify-between shrink-0">
          {<span>{workspace?.path.split("/").pop() ?? "workspace"}</span>}
          {workspace?.path && <WorkspaceDropdownMenu workspace={workspace} />}
        </SidebarGroupLabel>

        <div
          ref={parentRef}
          className="relative flex-1 overflow-auto"
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
                <div
                  ref={highlightOverlayRef}
                  className="pointer-events-none absolute left-0 right-0 rounded-md bg-primary/10"
                  style={{ display: "none" }}
                />
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
                        <SidebarMenuItem style={{ paddingLeft: `${indentPx}px` }}>
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
                      <DraggableTreeRow
                        flatItem={flatItem as FlatFileTreeItem}
                        isRenaming={editingItem?.path === (flatItem as FlatFileTreeItem).item.path}
                        onExpandFolder={handleDragExpandFolder}
                        onHighlightFolder={handleHighlightFolder}
                        onClearHighlight={handleClearHighlight}
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
                          isCreatingInThisContext={
                            isCreatingInContext?.parentPath ===
                            (flatItem as FlatFileTreeItem).item.path
                          }
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
                      </DraggableTreeRow>
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
          <div
            ref={rootDropRef}
            className="absolute left-0 right-0 bottom-0"
            style={{ top: `${rowVirtualizer.getTotalSize()}px` }}
          />
        </div>
      </SidebarGroup>

      <DeleteConfirmDialog workspace={workspace} />
      <RevertConfirmDialog />
    </>
  )
}
