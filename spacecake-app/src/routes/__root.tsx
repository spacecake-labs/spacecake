import { useEffect } from "react"
import type { RouterContext } from "@/router"
import { PGliteProvider } from "@electric-sql/pglite-react"
import {
  createRootRouteWithContext,
  ErrorComponent,
  Outlet,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import { useOpenWorkspace } from "@/lib/open-workspace"
import { DatabaseContext } from "@/hooks/use-database"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: (error) => <ErrorComponent error={error} />,
})

function RootComponent() {
  const { db } = Route.useRouteContext()
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
    <PGliteProvider db={db.client}>
      <DatabaseContext.Provider value={db.orm}>
        <Outlet />
        <TanStackRouterDevtools />
      </DatabaseContext.Provider>
    </PGliteProvider>
  )
}
