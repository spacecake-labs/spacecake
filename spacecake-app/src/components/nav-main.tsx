import {
  ChevronRight,
  Plus,
  X,
  FileWarning,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef } from "react";
import * as React from "react";
import type { SidebarNavItem } from "@/lib/workspace";
import {
  isFile,
  isFolder,
  transformFilesToTree,
  getNavItemPath,
  getNavItemIcon,
  buildFileTree,
} from "@/lib/workspace";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createFile, readDirectory, renameFile } from "@/lib/fs";
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

  useEffect(() => {
    if (files && files.length > 0) {
      const newFileTree = buildFileTree(files);
      setFileTree(newFileTree);
    }
  }, [files, setFileTree]);

  return (
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
        {treeData.map((item) => (
          <Tree
            key={getNavItemPath(item)}
            item={item}
            onFileClick={handleFileClick}
            onFolderToggle={handleFolderToggle}
            onStartRename={handleStartRename}
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
  );
}

interface TreeProps {
  item: SidebarNavItem;
  onFileClick: (filePath: string) => void;
  onFolderToggle: (folderPath: string) => void;
  onStartRename: (item: SidebarNavItem) => void;
  selectedFilePath?: string | null;
  expandedFolders: Record<string, boolean>;
  fileTree: Record<string, SidebarNavItem[]>;
  editingItem: {
    type: "create" | "rename";
    path: string;
    value: string;
    originalValue?: string;
  } | null;
  setEditingItem: (
    item: {
      type: "create" | "rename";
      path: string;
      value: string;
      originalValue?: string;
    } | null
  ) => void;
  onRename: () => void;
  onRenameKeyDown: (e: React.KeyboardEvent) => void;
  onCancelRename: () => void;
  onRenameInputChange: (value: string) => void;
  validationError?: string | null;
}

function Tree({
  item,
  onFileClick,
  onFolderToggle,
  onStartRename,
  selectedFilePath,
  expandedFolders,
  fileTree,
  editingItem,
  setEditingItem,
  onRename,
  onRenameKeyDown,
  onCancelRename,
  onRenameInputChange,
  validationError,
}: TreeProps) {
  const filePath = getNavItemPath(item);
  const folderUrl = `#${filePath}`; // Use the same format as expandedFolders
  const isExpanded = Boolean(expandedFolders[folderUrl]);
  const isSelected = selectedFilePath === filePath;
  const isRenaming = editingItem?.path === filePath;

  if (isFile(item)) {
    // This is a file
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isRenaming && inputRef.current) {
        // Select filename without extension (like VSCode)
        const lastDotIndex = editingItem.value.lastIndexOf(".");
        const selectEnd =
          lastDotIndex > 0 ? lastDotIndex : editingItem.value.length;
        inputRef.current.setSelectionRange(0, selectEnd);
      }
    }, [isRenaming]); // Only run when isRenaming changes

    return (
      <SidebarMenuItem>
        {isRenaming ? (
          <div className="flex flex-col">
            <SidebarMenuButton className="cursor-default">
              <Input
                value={editingItem.value}
                onChange={(e) => onRenameInputChange(e.target.value)}
                onKeyDown={onRenameKeyDown}
                className={`h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${
                  validationError ? "border-destructive" : ""
                }`}
                autoFocus
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
        ) : (
          <SidebarMenuButton
            isActive={isSelected}
            onClick={() => onFileClick(filePath)}
            className="cursor-pointer"
          >
            {React.createElement(getNavItemIcon(item))}
            <span className="truncate">{item.title}</span>
          </SidebarMenuButton>
        )}
        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction
                showOnHover
                className="cursor-pointer"
                aria-label={`more options for ${item.title}`}
                data-testid={`more-options-${item.title}`}
              >
                <MoreHorizontal />
                <span className="sr-only">more options for {item.title}</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem onClick={() => onStartRename(item)}>
                <span>rename</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isRenaming && (
          <SidebarMenuAction
            className="cursor-pointer"
            onClick={onCancelRename}
          >
            <X className="h-3 w-3" />
            <span className="sr-only">cancel</span>
          </SidebarMenuAction>
        )}
      </SidebarMenuItem>
    );
  }

  if (isFolder(item)) {
    // This is a folder
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isRenaming && inputRef.current) {
        // Select filename without extension (like VSCode)
        const lastDotIndex = editingItem.value.lastIndexOf(".");
        const selectEnd =
          lastDotIndex > 0 ? lastDotIndex : editingItem.value.length;
        inputRef.current.setSelectionRange(0, selectEnd);
      }
    }, [isRenaming]); // Only run when isRenaming changes

    return (
      <SidebarMenuItem>
        <Collapsible
          className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
          open={isExpanded}
        >
          <CollapsibleTrigger asChild>
            {isRenaming ? (
              <div className="flex flex-col">
                <SidebarMenuButton className="cursor-default">
                  <Input
                    value={editingItem.value}
                    onChange={(e) => onRenameInputChange(e.target.value)}
                    onKeyDown={onRenameKeyDown}
                    className={`h-6 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${
                      validationError ? "border-destructive" : ""
                    }`}
                    autoFocus
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
            ) : (
              <SidebarMenuButton
                onClick={() => onFolderToggle(filePath)}
                className="cursor-pointer"
              >
                <ChevronRight className="transition-transform" />
                {React.createElement(getNavItemIcon(item))}
                <span className="truncate">{item.title}</span>
              </SidebarMenuButton>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {fileTree[filePath] && fileTree[filePath].length > 0 ? (
                fileTree[filePath].map((subItem) => (
                  <Tree
                    key={getNavItemPath(subItem)}
                    item={subItem}
                    onFileClick={onFileClick}
                    onFolderToggle={onFolderToggle}
                    onStartRename={onStartRename}
                    selectedFilePath={selectedFilePath}
                    expandedFolders={expandedFolders}
                    fileTree={fileTree}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                    onRename={onRename}
                    onRenameKeyDown={onRenameKeyDown}
                    onCancelRename={onCancelRename}
                    onRenameInputChange={onRenameInputChange}
                    validationError={validationError}
                  />
                ))
              ) : (
                <div className="pl-6 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <FileWarning className="h-3 w-3" />
                  <span>empty</span>
                </div>
              )}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction
                showOnHover
                className="cursor-pointer"
                aria-label={`more options for ${item.title}`}
                data-testid={`more-options-${item.title}`}
              >
                <MoreHorizontal />
                <span className="sr-only">more options for {item.title}</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem onClick={() => onStartRename(item)}>
                <span>rename</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isRenaming && (
          <SidebarMenuAction
            className="cursor-pointer"
            onClick={onCancelRename}
          >
            <X className="h-3 w-3" />
            <span className="sr-only">cancel</span>
          </SidebarMenuAction>
        )}
      </SidebarMenuItem>
    );
  }

  // This is an empty item
  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="cursor-default">
        <FileWarning className="text-muted-foreground" />
        <span className="truncate">{item.message}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
