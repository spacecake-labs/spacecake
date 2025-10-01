import * as React from "react"
import {
  localStorageService,
  saveEditorLayout,
  updateRecentFiles,
} from "@/services/storage"
import { useAtom, useAtomValue } from "jotai"
import { FileWarning, Loader2Icon } from "lucide-react"

import { match } from "@/types/adt"
import type { EditorLayout } from "@/types/editor"
import type {
  ExpandedFolders,
  File,
  Folder,
  WorkspaceInfo,
} from "@/types/workspace"
import {
  contextItemNameAtom,
  deletionStateAtom,
  editingItemAtom,
  expandedFoldersAtom,
  isCreatingInContextAtom,
} from "@/lib/atoms/atoms"
import { sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import {
  createFolder,
  remove,
  // readDirectory,
  rename,
  saveFile,
} from "@/lib/fs"
import { useEditorContext } from "@/hooks/use-filepath"
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
import {
  WorkspaceDropdownMenu,
  WorkspaceTree,
} from "@/components/workspace-tree"

interface NavMainProps {
  onExpandFolder?: (folderPath: Folder["path"], forceExpand?: boolean) => void
  expandedFolders?: ExpandedFolders
  onFileClick?: (filePath: string) => void
  selectedFilePath?: string | null
  workspace: WorkspaceInfo
}

export function NavMain({
  onExpandFolder,
  onFileClick,
  selectedFilePath: initialSelectedFilePath, // renamed to avoid conflict
  workspace,
}: NavMainProps) {
  const [editingItem, setEditingItem] = useAtom(editingItemAtom)
  const [expandedFoldersState] = useAtom(expandedFoldersAtom)
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  )
  const [contextItemName, setContextItemName] = useAtom(contextItemNameAtom)
  const [deletionState, setDeletionState] = useAtom(deletionStateAtom)

  const editorContext = useEditorContext()
  const selectedFilePath = editorContext?.filePath || null

  // Validation state for rename
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  )

  const sortedFileTree = useAtomValue(sortedFileTreeAtom)

  const isCreatingInWorkspace =
    isCreatingInContext?.parentPath === workspace?.path

  const handleCreateFile = async (parentPath: string) => {
    const filePath = `${parentPath}/${contextItemName.trim()}`
    const result = await saveFile(filePath, "")

    match(result, {
      onLeft: (error) => {
        console.error("error creating file:", error)
      },
      onRight: () => {
        // Clear the creation state to hide the input field
        setIsCreatingInContext(null)
        setContextItemName("")
        handleFileCreated(filePath)
      },
    })
  }

  const handleCreateFolder = async (parentPath: string) => {
    const folderPath = `${parentPath}/${contextItemName.trim()}`
    const result = await createFolder(folderPath)

    match(result, {
      onLeft: (error) => {
        console.error("error creating folder:", error)
      },
      onRight: () => {
        // Clear the creation state to hide the input field
        setIsCreatingInContext(null)
        setContextItemName("")
      },
    })
  }

  const handleWorkspaceKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (isCreatingInContext?.kind === "file") {
        await handleCreateFile(isCreatingInContext.parentPath)
      } else if (isCreatingInContext?.kind === "folder") {
        await handleCreateFolder(isCreatingInContext.parentPath)
      }
    } else if (e.key === "Escape") {
      setIsCreatingInContext(null)
      setContextItemName("")
    }
  }

  // Validate rename target
  const validateRenameTarget = (
    newName: string,
    currentPath: string,
    originalName: string
  ): string | null => {
    if (!newName.trim()) return "name cannot be empty"

    // If the name hasn't changed, it's not an error
    if (newName.trim() === originalName) return null

    const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"))
    const newPath = `${currentDir}/${newName.trim()}`

    // Check if target already exists
    const existingFile = sortedFileTree.find(
      (f: File | Folder) => f.path === newPath
    )
    if (existingFile) {
      return `'${newName.trim()}' already exists`
    }

    return null
  }

  const handleFileCreated = (filePath: string) => {
    if (onFileClick) {
      onFileClick(filePath)
    }
  }

  const handleFilesUpdated = () => {
    // This will be called when files are updated through context-aware creation
    // The file tree will be automatically updated through the atoms
  }

  const handleFileClick = (filePath: string) => {
    if (onFileClick) {
      onFileClick(filePath)
    }
  }

  const handleFolderToggle = async (folderPath: Folder["path"]) => {
    if (onExpandFolder) {
      onExpandFolder(folderPath)
    }
  }

  const handleStartRename = (item: File | Folder) => {
    if (item.kind === "file" || item.kind === "folder") {
      setEditingItem({
        type: "rename",
        path: item.path,
        value: item.name,
        originalValue: item.name,
      })
      setValidationError(null) // Clear any previous validation errors
    }
  }

  const handleRename = async () => {
    if (!editingItem || !workspace?.path) return

    const oldPath = editingItem.path
    const newName = editingItem.value.trim()

    if (!newName) {
      setEditingItem(null)
      return
    }

    // If the name hasn't changed, just cancel the rename
    if (newName === editingItem.originalValue) {
      setEditingItem(null)
      setValidationError(null)
      return
    }

    // Validate the rename target
    const error = validateRenameTarget(
      newName,
      oldPath,
      editingItem.originalValue || ""
    )
    if (error) {
      setValidationError(error)
      return
    }

    // Construct new path
    const pathParts = oldPath.split("/")
    pathParts.pop() // Remove the old filename
    const newPath =
      pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName

    const result = await rename(oldPath, newPath)

    match(result, {
      onLeft: (error) => {
        console.error(error)
        setValidationError("error renaming file")
      },
      onRight: () => {
        // Update selected file path if it was the renamed file
        if (selectedFilePath === oldPath) {
          handleFileClick(newPath)
        }

        setEditingItem(null)
        setValidationError(null)
      },
    })
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename()
    } else if (e.key === "Escape") {
      setEditingItem(null)
    }
  }

  const cancelRename = () => {
    setEditingItem(null)
    setValidationError(null)
  }

  const handleRenameInputChange = (value: string) => {
    if (editingItem) {
      setEditingItem({ ...editingItem, value })

      // Validate on input change
      const error = validateRenameTarget(
        value,
        editingItem.path,
        editingItem.originalValue || ""
      )
      setValidationError(error)
    }
  }

  const handleStartDelete = (item: File | Folder) => {
    setDeletionState({ item, isOpen: true, isDeleting: false })
  }

  const handleConfirmDelete = async () => {
    if (!deletionState.item || !workspace?.path) return

    setDeletionState((prev) => ({ ...prev, isDeleting: true }))

    const itemToDelete = deletionState.item
    const result = await remove(
      itemToDelete.path,
      deletionState.item.kind === "folder"
    )

    match(result, {
      onLeft: (error) => {
        console.error(error)
        // Reset deleting state on failure but keep dialog open
        setDeletionState((prev) => ({ ...prev, isDeleting: false }))
      },
      onRight: () => {
        // if the deleted file was the currently selected one, clear the layout
        if (selectedFilePath === itemToDelete.path) {
          const emptyLayout: EditorLayout = {
            tabGroups: [],
            activeTabGroupId: null,
          }
          saveEditorLayout(localStorageService, emptyLayout, workspace.path)
        }

        // remove from recent files
        updateRecentFiles(localStorageService, {
          type: "remove",
          filePath: itemToDelete.path,
          workspacePath: workspace.path,
        })

        // Close dialog only after successful deletion
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

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center justify-between">
          {<span>{workspace?.path.split("/").pop() ?? "workspace"}</span>}
          {workspace?.path && <WorkspaceDropdownMenu workspace={workspace} />}
        </SidebarGroupLabel>

        <SidebarMenu>
          {isCreatingInWorkspace && workspace?.path && (
            <SidebarMenuItem>
              <SidebarMenuButton className="cursor-default">
                <Input
                  placeholder={
                    isCreatingInContext?.kind === "file"
                      ? "filename.txt"
                      : "folder name"
                  }
                  value={contextItemName}
                  onChange={(e) => setContextItemName(e.target.value)}
                  onKeyDown={async (e) => await handleWorkspaceKeyDown(e)}
                  className="h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {workspace?.path &&
            sortedFileTree &&
            sortedFileTree.map((item) => (
              <WorkspaceTree
                key={item.path}
                children={item.kind === "folder" ? item.children : undefined}
                item={item}
                onFileClick={handleFileClick}
                onFolderToggle={handleFolderToggle}
                onStartRename={handleStartRename}
                onStartDelete={handleStartDelete}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                selectedFilePath={initialSelectedFilePath} // Use the prop here
                expandedFolders={expandedFoldersState}
                editingItem={editingItem}
                setEditingItem={setEditingItem}
                onRename={handleRename}
                onRenameKeyDown={handleRenameKeyDown}
                onCancelRename={cancelRename}
                onRenameInputChange={handleRenameInputChange}
                validationError={validationError}
                onFilesUpdated={handleFilesUpdated}
                onExpandFolder={onExpandFolder}
                workspace={workspace}
              />
            ))}
          {/* Add empty state when workspace has no files/folders */}
          {workspace?.path && !sortedFileTree.length && (
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
