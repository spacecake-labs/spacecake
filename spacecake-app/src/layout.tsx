import { ReactNode } from "react"

import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

interface RootLayoutProps {
  children: ReactNode
  selectedFilePath: string | null
  headerRightContent: ReactNode
}

export function RootLayout({
  children,
  selectedFilePath,
  headerRightContent,
}: RootLayoutProps) {
  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <AppSidebar selectedFilePath={selectedFilePath} />
        <SidebarInset className="overflow-auto">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1 cursor-pointer" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
            </div>
            {headerRightContent}
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
