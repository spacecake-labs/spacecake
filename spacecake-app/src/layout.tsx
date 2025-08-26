import { ReactNode } from "react"

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
  selectedFilePath: string | null
  headerRightContent: ReactNode
}

function LayoutContent({
  children,
  selectedFilePath,
  headerRightContent,
}: RootLayoutProps) {
  const { isMobile } = useSidebar()

  if (isMobile) {
    return (
      <>
        <AppSidebar selectedFilePath={selectedFilePath} />
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full p-2">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
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
      <ResizablePanel defaultSize={20} minSize={20} maxSize={40}>
        <AppSidebar selectedFilePath={selectedFilePath} />
      </ResizablePanel>
      <ResizableHandle withHandle className="w-0" />
      <ResizablePanel defaultSize={80} className="p-2">
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
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
  selectedFilePath,
  headerRightContent,
}: RootLayoutProps) {
  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <LayoutContent
          selectedFilePath={selectedFilePath}
          headerRightContent={headerRightContent}
        >
          {children}
        </LayoutContent>
      </SidebarProvider>
    </div>
  )
}
