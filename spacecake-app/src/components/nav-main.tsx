import { Plus, X } from "lucide-react";
import { useEffect } from "react";
import * as React from "react";
import type { SidebarNavItem } from "@/lib/workspace";
import {
  transformFilesToTree,
  buildFileTree,
  isFile,
  isFolder,
  getNavItemPath,
} from "@/lib/workspace";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createFile, readDirectory, renameFile, deleteFile } from "@/lib/fs";
import { useAtom, useAtomValue } from "jotai";
import {
  workspaceAtom,
  filesAtom,
  expandedFoldersAtom,
  isCreatingFileAtom,
  fileNameAtom,
  fileTreeAtom,
  editingItemAtom,
} from "@/lib/atoms";
import { WorkspaceTree } from "@/components/workspace-tree";

interface NavMainProps {
  onExpandFolder?: (folderUrl: string, folderPath: string) => void;
  expandedFolders?: Record<string, boolean>;
  onFileClick?: (filePath: string) => void;
  selectedFilePath?: string | null;
}

export function NavMain({
  onExpandFolder,
  onFileClick,
  selectedFilePath,
}: NavMainProps) {
  const [isCreatingFile, setIsCreatingFile] = useAtom(isCreatingFileAtom);
  const [fileName, setFileName] = useAtom(fileNameAtom);
  const [editingItem, setEditingItem] = useAtom(editingItemAtom);
  const workspace = useAtomValue(workspaceAtom);
  const [files, setFiles] = useAtom(filesAtom);
  const [expandedFoldersState] = useAtom(expandedFoldersAtom);
  const [fileTree, setFileTree] = useAtom(fileTreeAtom);

  // Validation state for rename
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  );

  // Delete confirmation state
  const [deleteItem, setDeleteItem] = React.useState<SidebarNavItem | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  // Transform files to tree structure
  const treeData = transformFilesToTree(files);

  // Validate rename target
  const validateRenameTarget = (
    newName: string,
    currentPath: string,
    originalName: string
  ): string | null => {
    if (!newName.trim()) return "name cannot be empty";

    // If the name hasn't changed, it's not an error
    if (newName.trim() === originalName) return null;

    const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"));
    const newPath = `${currentDir}/${newName.trim()}`;

    // Check if target already exists
    const existingFile = files.find((f) => f.path === newPath);
    if (existingFile) {
      return `'${newName.trim()}' already exists`;
    }

    return null;
  };

  const handleFileCreated = (filePath: string) => {
    if (onFileClick) {
      onFileClick(filePath);
    }
  };

  const handleCreateFile = async () => {
    if (!fileName.trim() || !workspace?.path) return;

    try {
      const filePath = `${workspace.path}/${fileName.trim()}`;
      const success = await createFile(filePath, "");

      if (success) {
        // Refresh the workspace to show the new file
        const files = await readDirectory(workspace.path);
        setFiles(files);

        setIsCreatingFile(false);
        setFileName("");

        handleFileCreated(filePath);
      }
    } catch (error) {
      console.error("error creating file:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreateFile();
    } else if (e.key === "Escape") {
      setIsCreatingFile(false);
      setFileName("");
    }
  };

  const startCreatingFile = () => {
    setIsCreatingFile(true);
    setFileName("");
  };

  const cancelCreatingFile = () => {
    setIsCreatingFile(false);
    setFileName("");
  };

  const handleFileClick = (filePath: string) => {
    if (onFileClick) {
      onFileClick(filePath);
    }
  };

  const handleFolderToggle = async (folderPath: string) => {
    if (onExpandFolder) {
      // Use the folder URL format that matches the SidebarNavItem
      const folderUrl = `#${folderPath}`;
      onExpandFolder(folderUrl, folderPath);
    }
  };

  const handleStartRename = (item: SidebarNavItem) => {
    if (isFile(item) || isFolder(item)) {
      setEditingItem({
        type: "rename",
        path: getNavItemPath(item),
        value: item.title,
        originalValue: item.title,
      });
      setValidationError(null); // Clear any previous validation errors
    }
  };

  const handleRename = async () => {
    if (!editingItem || !workspace?.path) return;

    const oldPath = editingItem.path;
    const newName = editingItem.value.trim();

    if (!newName) {
      setEditingItem(null);
      return;
    }

    // If the name hasn't changed, just cancel the rename
    if (newName === editingItem.originalValue) {
      setEditingItem(null);
      setValidationError(null);
      return;
    }

    // Validate the rename target
    const error = validateRenameTarget(
      newName,
      oldPath,
      editingItem.originalValue || ""
    );
    if (error) {
      setValidationError(error);
      return;
    }

    try {
      // Construct new path
      const pathParts = oldPath.split("/");
      pathParts.pop(); // Remove the old filename
      const newPath =
        pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName;

      const success = await renameFile(oldPath, newPath);

      if (success) {
        // Refresh the workspace to show the renamed file
        const files = await readDirectory(workspace.path);
        setFiles(files);

        // Update selected file path if it was the renamed file
        if (selectedFilePath === oldPath) {
          handleFileClick(newPath);
        }

        setEditingItem(null);
        setValidationError(null);
      } else {
        setValidationError("error renaming file");
      }
    } catch (error) {
      console.error("error renaming file:", error);
      setValidationError("error renaming file");
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditingItem(null);
    }
  };

  const cancelRename = () => {
    setEditingItem(null);
    setValidationError(null);
  };

  const handleRenameInputChange = (value: string) => {
    if (editingItem) {
      setEditingItem({ ...editingItem, value });

      // Validate on input change
      const error = validateRenameTarget(
        value,
        editingItem.path,
        editingItem.originalValue || ""
      );
      setValidationError(error);
    }
  };

  const handleStartDelete = (item: SidebarNavItem) => {
    setDeleteItem(item);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem || !workspace?.path) return;

    try {
      const filePath = getNavItemPath(deleteItem);
      const success = await deleteFile(filePath);

      if (success) {
        // Refresh the workspace to show the updated file list
        const files = await readDirectory(workspace.path);
        setFiles(files);

        // Clear selected file if it was the deleted file
        if (selectedFilePath === filePath) {
          handleFileClick("");
        }

        setShowDeleteDialog(false);
        setDeleteItem(null);
      } else {
        console.error("failed to delete file");
      }
    } catch (error) {
      console.error("error deleting file:", error);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setDeleteItem(null);
  };

  useEffect(() => {
    if (files && files.length > 0) {
      const newFileTree = buildFileTree(files);
      setFileTree(newFileTree);
    }
  }, [files, setFileTree]);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center justify-between">
          <span>workspace</span>
          {!isCreatingFile && workspace?.path && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-accent cursor-pointer"
              onClick={startCreatingFile}
            >
              <Plus className="h-3 w-3" />
              <span className="sr-only">create file</span>
            </Button>
          )}
        </SidebarGroupLabel>

        <SidebarMenu>
          {isCreatingFile && (
            <SidebarMenuItem>
              <SidebarMenuButton className="cursor-default">
                <Input
                  placeholder="filename.txt"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
              </SidebarMenuButton>
              <SidebarMenuAction
                className="cursor-pointer"
                onClick={cancelCreatingFile}
              >
                <X className="h-3 w-3" />
                <span className="sr-only">cancel</span>
              </SidebarMenuAction>
            </SidebarMenuItem>
          )}
          {workspace?.path &&
            treeData.map((item) => (
              <WorkspaceTree
                key={getNavItemPath(item)}
                item={item}
                onFileClick={handleFileClick}
                onFolderToggle={handleFolderToggle}
                onStartRename={handleStartRename}
                onStartDelete={handleStartDelete}
                selectedFilePath={selectedFilePath}
                expandedFolders={expandedFoldersState}
                fileTree={fileTree}
                editingItem={editingItem}
                setEditingItem={setEditingItem}
                onRename={handleRename}
                onRenameKeyDown={handleRenameKeyDown}
                onCancelRename={cancelRename}
                onRenameInputChange={handleRenameInputChange}
                validationError={validationError}
              />
            ))}
        </SidebarMenu>
      </SidebarGroup>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteItem && isFolder(deleteItem)
                ? "delete folder"
                : "delete file"}
            </DialogTitle>
            <DialogDescription>
              are you sure you want to delete '
              {deleteItem && (isFile(deleteItem) || isFolder(deleteItem))
                ? deleteItem.title
                : deleteItem?.message}
              '{deleteItem && isFolder(deleteItem) ? " and its contents" : ""}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDelete}>
              cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
