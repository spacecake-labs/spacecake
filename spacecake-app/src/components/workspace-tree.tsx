import { ChevronRight, X, FileWarning, MoreHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import * as React from "react";
import type { SidebarNavItem } from "@/lib/workspace";
import {
  isFile,
  isFolder,
  getNavItemPath,
  getNavItemIcon,
} from "@/lib/workspace";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
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
import { Input } from "@/components/ui/input";

interface WorkspaceTreeProps {
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

// Component for the dropdown menu
function ItemDropdownMenu({
  item,
  onStartRename,
  isRenaming,
}: {
  item: SidebarNavItem;
  onStartRename: (item: SidebarNavItem) => void;
  isRenaming: boolean;
}) {
  if (isRenaming) return null;

  const itemTitle = isFile(item) || isFolder(item) ? item.title : item.message;

  return (
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
        <DropdownMenuItem onClick={() => onStartRename(item)}>
          <span>rename</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
}: WorkspaceTreeProps) {
  const filePath = getNavItemPath(item);
  const folderUrl = `#${filePath}`; // Use the same format as expandedFolders
  const isExpanded = Boolean(expandedFolders[folderUrl]);
  const isSelected = selectedFilePath === filePath;
  const isRenaming = editingItem?.path === filePath;

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
          isRenaming={isRenaming}
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
              {fileTree[filePath] && fileTree[filePath].length > 0 ? (
                fileTree[filePath].map((subItem) => (
                  <WorkspaceTree
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
        <ItemDropdownMenu
          item={item}
          onStartRename={onStartRename}
          isRenaming={isRenaming}
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
