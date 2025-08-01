import { ChevronRight, Plus, X, FileWarning } from "lucide-react";
import { useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFile, readDirectory } from "@/lib/fs";
import { useAtom, useAtomValue } from "jotai";
import {
  workspaceAtom,
  filesAtom,
  expandedFoldersAtom,
  isCreatingFileAtom,
  fileNameAtom,
  fileTreeAtom,
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
  const workspace = useAtomValue(workspaceAtom);
  const [files, setFiles] = useAtom(filesAtom);
  const [expandedFoldersState] = useAtom(expandedFoldersAtom);
  const [fileTree, setFileTree] = useAtom(fileTreeAtom);

  // Transform files to tree structure
  const treeData = transformFilesToTree(files);

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
        {treeData.map((item, index) => (
          <Tree
            key={index}
            item={item}
            onFileClick={handleFileClick}
            onFolderToggle={handleFolderToggle}
            selectedFilePath={selectedFilePath}
            expandedFolders={expandedFoldersState}
            fileTree={fileTree}
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
  selectedFilePath?: string | null;
  expandedFolders: Record<string, boolean>;
  fileTree: Record<string, SidebarNavItem[]>;
}

function Tree({
  item,
  onFileClick,
  onFolderToggle,
  selectedFilePath,
  expandedFolders,
  fileTree,
}: TreeProps) {
  const filePath = getNavItemPath(item);
  const folderUrl = `#${filePath}`; // Use the same format as expandedFolders
  const isExpanded = Boolean(expandedFolders[folderUrl]);
  const isSelected = selectedFilePath === filePath;

  if (isFile(item)) {
    // This is a file
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onFileClick(filePath)}
          className="cursor-pointer"
        >
          {React.createElement(getNavItemIcon(item))}
          <span className="truncate">{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (isFolder(item)) {
    // This is a folder
    return (
      <SidebarMenuItem>
        <Collapsible
          className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
          open={isExpanded}
        >
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              onClick={() => onFolderToggle(filePath)}
              className="cursor-pointer"
            >
              <ChevronRight className="transition-transform" />
              {React.createElement(getNavItemIcon(item))}
              <span className="truncate">{item.title}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {fileTree[filePath] && fileTree[filePath].length > 0 ? (
                fileTree[filePath].map((subItem, index) => (
                  <Tree
                    key={index}
                    item={subItem}
                    onFileClick={onFileClick}
                    onFolderToggle={onFolderToggle}
                    selectedFilePath={selectedFilePath}
                    expandedFolders={expandedFolders}
                    fileTree={fileTree}
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
