import { useEffect } from "react"
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useAtomValue } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { encodeBase64Url } from "@/lib/utils"

export const Route = createRootRoute({
  component: () => {
    const navigate = useNavigate()
    const workspace = useAtomValue(workspaceAtom)
    const { handleOpenWorkspace } = useOpenWorkspace()

    useEffect(() => {
      if (workspace) {
        const id = encodeBase64Url(workspace.path)
        void navigate({ to: "/w/$workspaceId", params: { workspaceId: id } })
      }
    }, [workspace, navigate])

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
