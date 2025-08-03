import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  workspaceAtom,
  filesAtom,
  isCreatingInContextAtom,
  contextItemNameAtom,
  fileTreeAtom,
  expandedFoldersAtom,
} from "@/lib/atoms";
import { createFile, createFolder, readDirectory } from "@/lib/fs";
import { updateFolderContents } from "@/lib/workspace";
import {
  SidebarNavItem,
  isFile,
  isFolder,
  getNavItemPath,
} from "@/lib/workspace";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  ChevronRight,
  MoreHorizontal,
  X,
  Plus,
  FileWarning,
} from "lucide-react";
import { useEffect, useRef } from "react";
import * as React from "react";
import { getNavItemIcon } from "@/lib/workspace";
import { Button } from "@/components/ui/button";

interface WorkspaceTreeProps {
  item: SidebarNavItem;
  onFileClick: (filePath: string) => void;
  onFolderToggle: (folderPath: string) => void;
  onStartRename: (item: SidebarNavItem) => void;
  onStartDelete: (item: SidebarNavItem) => void;
  selectedFilePath?: string | null;
  expandedFolders: Record<string, boolean>;
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
  onFilesUpdated?: () => void;
  onExpandFolder?: (
    folderUrl: string,
    folderPath: string,
    forceExpand?: boolean
  ) => void;
}

// Component for the rename input field
function RenameInput({
  value,
  onChange,
  onKeyDown,
  validationError,
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  validationError?: string | null;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Select filename without extension (like VSCode) - only on initial focus
      const lastDotIndex = value.lastIndexOf(".");
      const selectEnd = lastDotIndex > 0 ? lastDotIndex : value.length;
      inputRef.current.setSelectionRange(0, selectEnd);
    }
  }, [autoFocus]);

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
  );
}

// Component for the dropdown menu (for files and folders)
function ItemDropdownMenu({
  item,
  onStartRename,
  onStartDelete,
  isRenaming,
  onExpandFolder,
}: {
  item: SidebarNavItem;
  onStartRename: (item: SidebarNavItem) => void;
  onStartDelete: (item: SidebarNavItem) => void;
  isRenaming: boolean;
  onExpandFolder?: (
    folderUrl: string,
    folderPath: string,
    forceExpand?: boolean
  ) => void;
}) {
  if (isRenaming) return null;

  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  );
  const setContextItemName = useSetAtom(contextItemNameAtom);

  const itemTitle = isFile(item) || isFolder(item) ? item.title : item.message;
  const itemPath = getNavItemPath(item);
  const isItemFolder = isFolder(item);

  const startCreatingFile = () => {
    setIsCreatingInContext({ type: "file", parentPath: itemPath });
    setContextItemName("");

    // Auto-expand the parent folder so the input field is visible
    if (isItemFolder && onExpandFolder) {
      const folderUrl = `#${itemPath}`;
      // Immediately expand the folder for creation context
      onExpandFolder(folderUrl, itemPath, true);
    }
  };

  const startCreatingFolder = () => {
    setIsCreatingInContext({ type: "folder", parentPath: itemPath });
    setContextItemName("");

    // Auto-expand the parent folder so the input field is visible
    if (isItemFolder && onExpandFolder) {
      const folderUrl = `#${itemPath}`;
      // Immediately expand the folder for creation context
      onExpandFolder(folderUrl, itemPath, true);
    }
  };

  const cancelCreating = () => {
    setIsCreatingInContext(null);
    setContextItemName("");
  };

  const isCreatingInThisContext = isCreatingInContext?.parentPath === itemPath;

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
              aria-label={`more options for ${itemTitle}`}
              data-testid={`more-options-${itemTitle}`}
            >
              <MoreHorizontal />
              <span className="sr-only">more options for {itemTitle}</span>
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
  );
}

// Component for the workspace-level dropdown menu (plus icon)
export function WorkspaceDropdownMenu() {
  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  );
  const setContextItemName = useSetAtom(contextItemNameAtom);
  const workspace = useAtomValue(workspaceAtom);

  const startCreatingFile = () => {
    if (!workspace?.path) return;
    setIsCreatingInContext({ type: "file", parentPath: workspace.path });
    setContextItemName("");
  };

  const startCreatingFolder = () => {
    if (!workspace?.path) return;
    setIsCreatingInContext({ type: "folder", parentPath: workspace.path });
    setContextItemName("");
  };

  const cancelCreating = () => {
    setIsCreatingInContext(null);
    setContextItemName("");
  };

  const isCreatingInWorkspace =
    isCreatingInContext?.parentPath === workspace?.path;

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
            >
              <Plus className="h-3 w-3" />
              <span className="sr-only">create file or folder</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onClick={startCreatingFile}>
              <span>new file</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={startCreatingFolder}>
              <span>new folder</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

// Component for the cancel rename button
function CancelRenameButton({ onCancel }: { onCancel: () => void }) {
  return (
    <SidebarMenuAction className="cursor-pointer" onClick={onCancel}>
      <X className="h-3 w-3" />
      <span className="sr-only">cancel</span>
    </SidebarMenuAction>
  );
}

// Component for the item button (non-renaming state)
function ItemButton({
  item,
  isSelected,
  onClick,
  showChevron = false,
}: {
  item: SidebarNavItem;
  isSelected?: boolean;
  onClick: () => void;
  showChevron?: boolean;
}) {
  const itemTitle = isFile(item) || isFolder(item) ? item.title : item.message;

  return (
    <SidebarMenuButton
      isActive={isSelected}
      onClick={onClick}
      className="cursor-pointer"
    >
      {showChevron && <ChevronRight className="transition-transform" />}
      {React.createElement(getNavItemIcon(item))}
      <span className="truncate">{itemTitle}</span>
    </SidebarMenuButton>
  );
}

export function WorkspaceTree({
  item,
  onFileClick,
  onFolderToggle,
  onStartRename,
  onStartDelete,
  selectedFilePath,
  expandedFolders,
  editingItem,
  setEditingItem,
  onRename,
  onRenameKeyDown,
  onCancelRename,
  onRenameInputChange,
  validationError,
  onFilesUpdated,
  onExpandFolder,
}: WorkspaceTreeProps) {
  const filePath = getNavItemPath(item);
  const folderUrl = `#${filePath}`; // Use the same format as expandedFolders
  const isExpanded = Boolean(expandedFolders[folderUrl]);
  const isSelected = selectedFilePath === filePath;
  const isRenaming = editingItem?.path === filePath;

  const [isCreatingInContext, setIsCreatingInContext] = useAtom(
    isCreatingInContextAtom
  );
  const [contextItemName, setContextItemName] = useAtom(contextItemNameAtom);
  const [, setFiles] = useAtom(filesAtom);
  const [fileTree, setFileTree] = useAtom(fileTreeAtom);
  const setExpandedFolders = useSetAtom(expandedFoldersAtom);
  const workspace = useAtomValue(workspaceAtom);

  const isCreatingInThisContext = isCreatingInContext?.parentPath === filePath;

  const handleCreateFile = async () => {
    if (!contextItemName.trim() || !workspace?.path) return;

    try {
      const filePath = isFolder(item)
        ? `${getNavItemPath(item)}/${contextItemName.trim()}`
        : `${workspace.path}/${contextItemName.trim()}`;

      const success = await createFile(filePath, "");

      if (success) {
        // If we created the file inside a folder, update the fileTree for that folder
        if (isFolder(item)) {
          const parentFolderPath = getNavItemPath(item);
          const parentFolderFiles = await readDirectory(parentFolderPath);
          setFileTree((prev) =>
            updateFolderContents(prev, parentFolderPath, parentFolderFiles)
          );
          // Ensure the folder stays expanded
          setExpandedFolders((prev) => ({
            ...prev,
            [`#${parentFolderPath}`]: true,
          }));
        } else {
          // If we created the file at the workspace root, refresh the workspace
          const files = await readDirectory(workspace.path);
          setFiles(files);
        }

        setIsCreatingInContext(null);
        setContextItemName("");
        onFilesUpdated?.();
      }
    } catch (error) {
      console.error("error creating file:", error);
    }
  };

  const handleCreateFolder = async () => {
    if (!contextItemName.trim() || !workspace?.path) return;

    try {
      const folderPath = isFolder(item)
        ? `${getNavItemPath(item)}/${contextItemName.trim()}`
        : `${workspace.path}/${contextItemName.trim()}`;

      const success = await createFolder(folderPath);

      if (success) {
        // If we created the folder inside another folder, update the fileTree for that folder
        if (isFolder(item)) {
          const parentFolderPath = getNavItemPath(item);
          const parentFolderFiles = await readDirectory(parentFolderPath);
          setFileTree((prev) =>
            updateFolderContents(prev, parentFolderPath, parentFolderFiles)
          );
          // Ensure the folder stays expanded
          setExpandedFolders((prev) => ({
            ...prev,
            [`#${parentFolderPath}`]: true,
          }));
        } else {
          // If we created the folder at the workspace root, refresh the workspace
          const files = await readDirectory(workspace.path);
          setFiles(files);
        }

        setIsCreatingInContext(null);
        setContextItemName("");
        onFilesUpdated?.();
      }
    } catch (error) {
      console.error("error creating folder:", error);
    }
  };

  const handleContextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (isCreatingInContext?.type === "file") {
        handleCreateFile();
      } else if (isCreatingInContext?.type === "folder") {
        handleCreateFolder();
      }
    } else if (e.key === "Escape") {
      setIsCreatingInContext(null);
      setContextItemName("");
    }
  };

  if (isFile(item)) {
    return (
      <SidebarMenuItem>
        {isRenaming ? (
          <RenameInput
            value={editingItem.value}
            onChange={onRenameInputChange}
            onKeyDown={onRenameKeyDown}
            validationError={validationError}
          />
        ) : (
          <ItemButton
            item={item}
            isSelected={isSelected}
            onClick={() => onFileClick(filePath)}
          />
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
    );
  }

  if (isFolder(item)) {
    return (
      <SidebarMenuItem>
        <Collapsible
          className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
          open={isExpanded}
        >
          <CollapsibleTrigger asChild>
            {isRenaming ? (
              <RenameInput
                value={editingItem.value}
                onChange={onRenameInputChange}
                onKeyDown={onRenameKeyDown}
                validationError={validationError}
              />
            ) : (
              <ItemButton
                item={item}
                onClick={() => onFolderToggle(filePath)}
                showChevron={true}
              />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {isCreatingInThisContext && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="cursor-default">
                    <Input
                      placeholder={
                        isCreatingInContext.type === "file"
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
              {fileTree[filePath] && fileTree[filePath].length > 0 ? (
                fileTree[filePath].map((subItem) => (
                  <WorkspaceTree
                    key={getNavItemPath(subItem)}
                    item={subItem}
                    onFileClick={onFileClick}
                    onFolderToggle={onFolderToggle}
                    onStartRename={onStartRename}
                    onStartDelete={onStartDelete}
                    selectedFilePath={selectedFilePath}
                    expandedFolders={expandedFolders}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                    onRename={onRename}
                    onRenameKeyDown={onRenameKeyDown}
                    onCancelRename={onCancelRename}
                    onRenameInputChange={onRenameInputChange}
                    validationError={validationError}
                    onFilesUpdated={onFilesUpdated}
                    onExpandFolder={onExpandFolder}
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
        <ItemDropdownMenu
          item={item}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          isRenaming={isRenaming}
          onExpandFolder={onExpandFolder}
        />
        {isRenaming && <CancelRenameButton onCancel={onCancelRename} />}
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
