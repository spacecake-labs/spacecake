import { useEffect } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import { useOpenWorkspace } from "@/lib/open-workspace"

export const Route = createRootRoute({
  component: () => {
    const { handleOpenWorkspace } = useOpenWorkspace()

    // global keyboard shortcut for opening workspace
    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          handleOpenWorkspace()
        }
      }

      document.addEventListener("keydown", down)
      return () => document.removeEventListener("keydown", down)
    }, [handleOpenWorkspace])

    return (
      <>
        <Outlet />
        <TanStackRouterDevtools />
      </>
    )
  },
})
