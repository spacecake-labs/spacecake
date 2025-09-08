import { useEffect } from "react"
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useAtom } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { pathExists } from "@/lib/fs"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { encodeBase64Url } from "@/lib/utils"

export const Route = createRootRoute({
  component: () => {
    const navigate = useNavigate()
    const [workspace, setWorkspace] = useAtom(workspaceAtom)

    const { handleOpenWorkspace } = useOpenWorkspace()

    useEffect(() => {
      if (workspace) {
        // validate workspace path exists before navigating
        pathExists(workspace.path).then((exists) => {
          if (exists) {
            const id = encodeBase64Url(workspace.path)
            void navigate({
              to: "/w/$workspaceId",
              params: { workspaceId: id },
            })
          } else {
            // clear stale workspace data and navigate to home with error
            setWorkspace(null)
            void navigate({
              to: "/",
              search: { notFoundPath: workspace.path },
            })
          }
        })
      }
    }, [workspace, navigate, setWorkspace])

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
