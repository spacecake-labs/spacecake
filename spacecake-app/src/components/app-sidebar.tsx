import { useAtom, useAtomValue } from "jotai";
import { workspaceAtom, expandedFoldersAtom } from "@/lib/atoms/atoms";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { CakeSlice } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { encodeBase64Url } from "@/lib/utils";
import { ExpandedFolders } from "@/types/workspace";
import { Folder } from "@/types/workspace";

interface AppSidebarProps {
  onFileClick?: (filePath: string) => void;
  selectedFilePath?: string | null;
}

export function AppSidebar({ onFileClick, selectedFilePath }: AppSidebarProps) {
  const workspace = useAtomValue(workspaceAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);

  const handleExpandFolder = async (
    folderPath: Folder["path"], // This is now the actual path, not a URL
    forceExpand?: boolean
  ) => {
    // Check if folder is currently expanded using the actual path
    const isCurrentlyExpanded = expandedFolders[folderPath] ?? false;

    // Determine if we should expand the folder
    const shouldExpand =
      forceExpand !== undefined ? forceExpand : !isCurrentlyExpanded;

    // Set expanded state using the actual path
    setExpandedFolders((prev: ExpandedFolders) => ({
      ...prev,
      [folderPath]: shouldExpand,
    }));
  };

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                to={workspace?.path ? "/w/$workspaceId" : "/"}
                params={
                  workspace?.path
                    ? { workspaceId: encodeBase64Url(workspace.path) }
                    : undefined
                }
                preload="intent"
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <CakeSlice className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">spacecake</span>
                  {workspace?.name && (
                    <span className="truncate text-xs">{workspace.name}</span>
                  )}
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <NavMain
        onExpandFolder={handleExpandFolder}
        expandedFolders={expandedFolders}
        onFileClick={onFileClick}
        selectedFilePath={selectedFilePath}
      />
      <NavProjects projects={[]} />
      <NavSecondary items={[]} />
      <NavUser user={{ name: "User", email: "user@example.com", avatar: "" }} />
    </Sidebar>
  );
}
