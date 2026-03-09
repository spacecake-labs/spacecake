import {
  createRootRouteWithContext,
  ErrorComponent,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { usePostHog } from "posthog-js/react"
import { useEffect } from "react"

import { useHotkey } from "@/hooks/use-hotkey"
import { useMenuAction } from "@/hooks/use-menu-action"
import { useOpenWorkspace } from "@/lib/open-workspace"
import type { RouterContext } from "@/router"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: (error) => <ErrorComponent error={error} />,
})

function RootComponent() {
  const { handleOpenWorkspace } = useOpenWorkspace()
  const posthog = usePostHog()
  const location = useLocation()

  // global keyboard shortcut for opening workspace
  useHotkey("mod+o", () => handleOpenWorkspace())
  useMenuAction("open-folder", () => handleOpenWorkspace())

  useEffect(() => {
    if (posthog) {
      posthog.capture("$pageview", {
        $current_url: window.location.origin + location.href,
      })
    }
  }, [location.href, posthog])

  return (
    <>
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  )
}
