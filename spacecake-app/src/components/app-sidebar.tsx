/*
AppSidebar handles sidebar UI and folder expansion state.
*/
import iconSvg from "@/images/icon.svg"
import { Link } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { ListTodo, Terminal } from "lucide-react"

import {
  AbsolutePath,
  ExpandedFolders,
  Folder,
  WorkspaceInfo,
} from "@/types/workspace"
import { expandedFoldersAtom } from "@/lib/atoms/atoms"
import { cn, encodeBase64Url } from "@/lib/utils"
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
  isTerminalExpanded?: boolean
  isTaskExpanded?: boolean
  onToggleTerminal?: () => void
  onToggleTask?: () => void
}

export function AppSidebar({
  onFileClick,
  workspace,
  selectedFilePath,
  isTerminalExpanded,
  isTaskExpanded,
  onToggleTerminal,
  onToggleTask,
}: AppSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom)

  const handleExpandFolder = async (
    folderPath: Folder["path"],
    forceExpand?: boolean
  ) => {
    // Check if folder is currently expanded
    const isCurrentlyExpanded = !!expandedFolders[folderPath]

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
      {/* Drag region for window traffic lights area */}
      <div className="app-drag h-10" />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="app-no-drag">
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
                <div className="bg-transparent text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <img src={iconSvg} alt="spacecake" className="size-8" />
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
        {(onToggleTerminal || onToggleTask) && (
          <div className="flex items-center gap-2 px-3 pt-2">
            {onToggleTerminal && (
              <button
                onClick={onToggleTerminal}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-all cursor-pointer",
                  isTerminalExpanded
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300"
                )}
                aria-label={
                  isTerminalExpanded ? "hide terminal" : "show terminal"
                }
                title={isTerminalExpanded ? "hide terminal" : "show terminal"}
              >
                <Terminal className="h-3 w-3" />
                terminal
              </button>
            )}
            {onToggleTask && (
              <button
                onClick={onToggleTask}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-all cursor-pointer",
                  isTaskExpanded
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300"
                )}
                aria-label={isTaskExpanded ? "hide tasks" : "show tasks"}
                title={isTaskExpanded ? "hide tasks" : "show tasks"}
              >
                <ListTodo className="h-3 w-3" />
                tasks
              </button>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="pb-20">
        <NavMain
          onExpandFolder={handleExpandFolder}
          onFileClick={onFileClick}
          selectedFilePath={selectedFilePath}
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
