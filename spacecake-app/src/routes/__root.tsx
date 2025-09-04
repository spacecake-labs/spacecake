import { useEffect } from "react"
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useAtomValue } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { encodeBase64Url } from "@/lib/utils"

export const Route = createRootRoute({
  component: () => {
    const navigate = useNavigate()
    const workspace = useAtomValue(workspaceAtom)

    useEffect(() => {
      if (workspace) {
        const id = encodeBase64Url(workspace.path)
        void navigate({ to: "/w/$workspaceId", params: { workspaceId: id } })
      }
    }, [workspace, navigate])

    return (
      <>
        <Outlet />
        <TanStackRouterDevtools />
      </>
    )
  },
})
