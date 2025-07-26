"use client";

import { ChevronRight, Plus, X } from "lucide-react";
import type { SidebarNavItem } from "@/lib/workspace";
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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFile } from "@/lib/fs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  workspaceAtom,
  sidebarNavAtom,
  isCreatingFileAtom,
  fileNameAtom,
} from "@/lib/atoms";
import { transformFilesToNavItems } from "@/lib/workspace";
import { readDirectory } from "@/lib/fs";

interface NavMainProps {
  items: SidebarNavItem[];
  onExpandFolder?: (folderUrl: string, folderPath: string) => void;
  loadingFolders?: string[];
  expandedFolders?: Record<string, boolean>;
  onFileClick?: (filePath: string) => void;
  selectedFilePath?: string | null;
}

export function NavMain({
  items,
  onExpandFolder,
  loadingFolders = [],
  expandedFolders = {},
  onFileClick,
  selectedFilePath,
}: NavMainProps) {
  const [isCreatingFile, setIsCreatingFile] = useAtom(isCreatingFileAtom);
  const [fileName, setFileName] = useAtom(fileNameAtom);
  const workspace = useAtomValue(workspaceAtom);
  const setSidebarNav = useSetAtom(sidebarNavAtom);

  const handleToggle = (item: SidebarNavItem) => {
    if (!item.isDirectory) {
      if (onFileClick) {
        // Remove leading '#' from url to get the file path
        onFileClick(item.url.replace(/^#/, ""));
      }
      return;
    }
    if (onExpandFolder) {
      onExpandFolder(item.url, item.url.replace(/^#/, ""));
    }
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
        const navItems = transformFilesToNavItems(files);
        setSidebarNav(navItems);

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
        {items.map((item) => (
          <Collapsible
            key={item.title}
            asChild
            open={!!expandedFolders[item.url]}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={item.title}
                onClick={() => handleToggle(item)}
                isActive={Boolean(
                  selectedFilePath &&
                    !item.isDirectory &&
                    item.url.replace(/^#/, "") === selectedFilePath
                )}
                className="cursor-pointer"
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
              {item.isDirectory ? (
                <>
                  <CollapsibleTrigger asChild className="cursor-pointer">
                    <SidebarMenuAction
                      className="data-[state=open]:rotate-90"
                      onClick={() => handleToggle(item)}
                    >
                      <ChevronRight />
                      <span className="sr-only">toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {loadingFolders.includes(item.url) ? (
                      <div className="pl-6 py-2 text-xs text-muted-foreground">
                        loading...
                      </div>
                    ) : (
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              onClick={() => {
                                if (onFileClick) {
                                  onFileClick(subItem.url.replace(/^#/, ""));
                                }
                              }}
                              isActive={Boolean(
                                selectedFilePath &&
                                  subItem.url.replace(/^#/, "") ===
                                    selectedFilePath
                              )}
                            >
                              <a href={subItem.url}>
                                <subItem.icon />
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
