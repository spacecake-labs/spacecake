import { ReactNode, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Check, Copy } from "lucide-react"

import { WorkspaceInfo } from "@/types/workspace"
import { condensePath, encodeBase64Url } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

interface RootLayoutProps {
  children: ReactNode
  workspace: WorkspaceInfo
  selectedFilePath: string | null
  headerRightContent: ReactNode
}

function LayoutContent({
  children,
  workspace,
  selectedFilePath,
  headerRightContent,
}: RootLayoutProps) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()

  const handleFileClick = (filePath: string) => {
    if (workspace?.path) {
      const workspaceIdEncoded = encodeBase64Url(workspace.path)
      const filePathEncoded = encodeBase64Url(filePath)
      navigate({
        to: "/w/$workspaceId/f/$filePath",
        params: {
          workspaceId: workspaceIdEncoded,
          filePath: filePathEncoded,
        },
      })
    }
  }

  const [copied, setCopied] = useState(false)

  const handleCopyPath = async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy path:", err)
    }
  }

  if (isMobile) {
    return (
      <>
        <AppSidebar
          onFileClick={handleFileClick}
          workspace={workspace}
          selectedFilePath={selectedFilePath}
        />
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full p-2">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              {selectedFilePath && (
                <div
                  className="flex items-center gap-2 min-w-0"
                  data-testid="current-file-path"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground/70 truncate">
                      {condensePath(selectedFilePath)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyPath(selectedFilePath)}
                    className="h-7 w-7 p-0 cursor-pointer flex-shrink-0"
                    aria-label="copy path"
                    title="copy path"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
            {headerRightContent}
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </main>
      </>
    )
  }
  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen">
      <ResizablePanel
        defaultSize={15}
        minSize={15}
        maxSize={40}
        className="flex flex-col h-full [&>*]:flex-1 [&>*]:min-h-0"
      >
        <AppSidebar
          onFileClick={handleFileClick}
          workspace={workspace}
          selectedFilePath={selectedFilePath}
        />
      </ResizablePanel>
      <ResizableHandle withHandle className="w-0" />
      <ResizablePanel defaultSize={85} className="p-2">
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              {selectedFilePath && (
                <div
                  className="flex items-center gap-2 min-w-0"
                  data-testid="current-file-path"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground/70 truncate">
                      {condensePath(selectedFilePath)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyPath(selectedFilePath)}
                    className="h-7 w-7 p-0 cursor-pointer flex-shrink-0"
                    aria-label="copy path"
                    title="copy path"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
            {headerRightContent}
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export function RootLayout({
  children,
  workspace,
  selectedFilePath,
  headerRightContent,
}: RootLayoutProps) {
  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <LayoutContent
          workspace={workspace}
          selectedFilePath={selectedFilePath}
          headerRightContent={headerRightContent}
        >
          {children}
        </LayoutContent>
      </SidebarProvider>
    </div>
  )
}
