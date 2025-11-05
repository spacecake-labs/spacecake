/*
AppSidebar handles sidebar UI and folder expansion state.
*/
import { Link } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { CakeSlice } from "lucide-react"

import {
  AbsolutePath,
  ExpandedFolders,
  Folder,
  WorkspaceInfo,
} from "@/types/workspace"
import { expandedFoldersAtom } from "@/lib/atoms/atoms"
import { encodeBase64Url } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavMain } from "@/components/nav-main"

// import { NavProjects } from "@/components/nav-projects"
// import { NavSecondary } from "@/components/nav-secondary"
// import { NavUser } from "@/components/nav-user"

interface AppSidebarProps {
  onFileClick?: (filePath: AbsolutePath) => void
  workspace: WorkspaceInfo
  selectedFilePath?: AbsolutePath | null
  foldersToExpand?: string[]
}

export function AppSidebar({
  onFileClick,
  workspace,
  selectedFilePath,
  foldersToExpand = [],
}: AppSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom)

  const handleExpandFolder = async (
    folderPath: Folder["path"], // This is now the actual path, not a URL
    forceExpand?: boolean
  ) => {
    // Check if folder is currently expanded/auto-revealed using the actual path
    const isCurrentlyExpanded =
      expandedFolders[folderPath] ?? foldersToExpand.includes(folderPath)

    // Determine if we should expand the folder
    const shouldExpand =
      forceExpand !== undefined ? forceExpand : !isCurrentlyExpanded

    // Set expanded state using the actual path
    setExpandedFolders((prev: ExpandedFolders) => ({
      ...prev,
      [folderPath]: shouldExpand,
    }))
  }

  return (
    <Sidebar variant="inset" data-testid="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                to={workspace?.path ? "/w/$workspaceId" : "/"}
                params={
                  workspace?.path
                    ? {
                        workspaceId: encodeBase64Url(workspace.path),
                      }
                    : undefined
                }
                // preload="intent"
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
      <SidebarContent>
        <NavMain
          onExpandFolder={handleExpandFolder}
          expandedFolders={expandedFolders}
          onFileClick={onFileClick}
          selectedFilePath={selectedFilePath}
          foldersToExpand={foldersToExpand}
          workspace={workspace}
        />
        {/* <NavProjects projects={[]} />
        <NavSecondary items={[]} />
        <NavUser
          user={{ name: "User", email: "user@example.com", avatar: "" }}
        /> */}
      </SidebarContent>
    </Sidebar>
  )
}
