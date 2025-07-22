"use client";

import { ChevronRight } from "lucide-react";
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

  return (
    <SidebarGroup>
      <SidebarGroupLabel>workspace</SidebarGroupLabel>
      <SidebarMenu>
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
                className="cursor-pointer"
                isActive={Boolean(
                  selectedFilePath &&
                    !item.isDirectory &&
                    item.url.replace(/^#/, "") === selectedFilePath
                )}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
              {item.isDirectory ? (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction
                      className="data-[state=open]:rotate-90"
                      onClick={() => handleToggle(item)}
                    >
                      <ChevronRight />
                      <span className="sr-only">Toggle</span>
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
