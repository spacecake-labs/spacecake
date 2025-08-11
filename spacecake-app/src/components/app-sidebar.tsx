import { useAtom, useAtomValue } from "jotai";
import { workspaceAtom, expandedFoldersAtom, fileTreeAtom } from "@/lib/atoms";
import { readDirectory } from "@/lib/fs";
import { updateFolderContents } from "@/lib/workspace";
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

interface AppSidebarProps {
  onFileClick?: (filePath: string) => void;
  selectedFilePath?: string | null;
}

export function AppSidebar({ onFileClick, selectedFilePath }: AppSidebarProps) {
  const workspace = useAtomValue(workspaceAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const [, setFileTree] = useAtom(fileTreeAtom);

  const handleExpandFolder = async (
    folderUrl: string,
    folderPath: string,
    forceExpand?: boolean
  ) => {
    // Check if folder is currently expanded
    const isCurrentlyExpanded = expandedFolders[folderUrl];

    // Determine if we should expand the folder
    const shouldExpand =
      forceExpand !== undefined ? forceExpand : !isCurrentlyExpanded;

    // Set expanded state
    setExpandedFolders((prev: Record<string, boolean>) => ({
      ...prev,
      [folderUrl]: shouldExpand,
    }));

    // Load folder contents if we're expanding (not collapsing)
    if (shouldExpand && !isCurrentlyExpanded) {
      try {
        const folderFiles = await readDirectory(folderPath);
        // Update the tree structure with folder contents
        // Use folderPath (without #) as the key for fileTree
        setFileTree((prev) =>
          updateFolderContents(prev, folderPath, folderFiles)
        );
      } catch (error) {
        console.error("error loading folder:", error);
      }
    }
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
