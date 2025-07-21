import * as React from "react";
import { Frame, LifeBuoy, Map, PieChart, Send, CakeSlice } from "lucide-react";
import { useAtom } from "jotai";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  sidebarNavAtom,
  workspaceInfoAtom,
  expandedFoldersAtom,
  loadingFoldersAtom,
} from "@/lib/atoms";
import { transformFilesToNavItems } from "@/lib/workspace";
import { readDirectory } from "@/lib/fs";
import type { SidebarNavItem } from "@/lib/workspace";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const defaultNavSecondary = [
  {
    title: "Support",
    url: "#",
    icon: LifeBuoy,
  },
  {
    title: "Feedback",
    url: "#",
    icon: Send,
  },
];

const defaultProjects = [
  {
    name: "Design Engineering",
    url: "#",
    icon: Frame,
  },
  {
    name: "Sales & Marketing",
    url: "#",
    icon: PieChart,
  },
  {
    name: "Travel",
    url: "#",
    icon: Map,
  },
];

const defaultUser = {
  name: "shadcn",
  email: "m@example.com",
  avatar: "/avatars/shadcn.jpg",
};

function updateNavItemsWithChildren(
  navItems: SidebarNavItem[],
  folderUrl: string,
  children: SidebarNavItem[]
): SidebarNavItem[] {
  return navItems.map((item) => {
    if (item.url === folderUrl && item.isDirectory) {
      return {
        ...item,
        items: children,
      };
    } else if (item.items && item.items.length > 0) {
      return {
        ...item,
        items: updateNavItemsWithChildren(item.items, folderUrl, children),
      };
    }
    return item;
  });
}

// Helper to find a nav item by url (recursive)
function findNavItemByUrl(
  items: SidebarNavItem[],
  url: string
): SidebarNavItem | null {
  for (const item of items) {
    if (item.url === url) return item;
    if (item.items) {
      const found = findNavItemByUrl(item.items, url);
      if (found) return found;
    }
  }
  return null;
}

export function AppSidebar({
  onFileClick,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  onFileClick?: (filePath: string) => void;
}) {
  const [sidebarNav, setSidebarNav] = useAtom(sidebarNavAtom);
  const [workspaceInfo] = useAtom(workspaceInfoAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const [loadingFolders, setLoadingFolders] = useAtom(loadingFoldersAtom);

  const handleExpandFolder = async (folderUrl: string, folderPath: string) => {
    // Toggle expanded state
    setExpandedFolders((prev) => ({ ...prev, [folderUrl]: !prev[folderUrl] }));
    // Only fetch if not already loaded and not already open
    const folderItem = findNavItemByUrl(sidebarNav, folderUrl);
    if (!folderItem || folderItem.items) return;
    if (loadingFolders.includes(folderUrl)) return;
    setLoadingFolders((prev) => [...prev, folderUrl]);
    const files = await readDirectory(folderPath);
    const children = transformFilesToNavItems(files);
    setSidebarNav((prev) =>
      updateNavItemsWithChildren(prev, folderUrl, children)
    );
    setLoadingFolders((prev) => prev.filter((url) => url !== folderUrl));
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <CakeSlice className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">spacecake</span>
                  {workspaceInfo?.name && (
                    <span className="truncate text-xs">
                      {workspaceInfo.name}
                    </span>
                  )}
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={sidebarNav}
          onExpandFolder={handleExpandFolder}
          loadingFolders={loadingFolders}
          expandedFolders={expandedFolders}
          onFileClick={onFileClick}
        />
        <NavProjects projects={defaultProjects} />
        <NavSecondary items={defaultNavSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={defaultUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
