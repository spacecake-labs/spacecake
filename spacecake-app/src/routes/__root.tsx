import {
  createRootRouteWithContext,
  ErrorComponent,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { usePostHog } from "posthog-js/react"
import { useEffect } from "react"

import type { RouterContext } from "@/router"

import { useHotkey } from "@/hooks/use-hotkey"
import { useOpenWorkspace } from "@/lib/open-workspace"

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
