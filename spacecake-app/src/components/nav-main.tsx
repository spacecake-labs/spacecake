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
}

export function NavMain({
  items,
  onExpandFolder,
  loadingFolders = [],
  expandedFolders = {},
}: NavMainProps) {
  const handleToggle = (item: SidebarNavItem) => {
    if (!item.isDirectory) return;
    if (onExpandFolder && !item.items && !expandedFolders[item.url]) {
      // Only fetch if not already loaded and not already open
      onExpandFolder(item.url, item.url.replace(/^#/, ""));
    } else if (onExpandFolder) {
      // Still call to toggle expanded state
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
                            <SidebarMenuSubButton asChild>
                              <a href={subItem.url}>
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
