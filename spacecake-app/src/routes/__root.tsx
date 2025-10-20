import { useEffect } from "react"
// Import the generated route tree
import { Database } from "@/services/database"
import { Migrations } from "@/services/migrations"
import { RuntimeClient } from "@/services/runtime-client"
import { PGliteProvider } from "@electric-sql/pglite-react"
import { createRootRoute, ErrorComponent, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Effect } from "effect"

import { useOpenWorkspace } from "@/lib/open-workspace"
import { DatabaseContext } from "@/hooks/use-database"
import { LoadingAnimation } from "@/components/loading-animation"

export const Route = createRootRoute({
  component: RootComponent,
  beforeLoad: () =>
    RuntimeClient.runPromise(
      Effect.gen(function* () {
        const migration = yield* Migrations
        yield* migration.apply
      })
    ),
  loader: () =>
    RuntimeClient.runPromise(
      Effect.gen(function* () {
        return yield* Database
      })
    ),
  pendingComponent: () => <LoadingAnimation />,
  errorComponent: (error) => <ErrorComponent error={error} />,
})

function RootComponent() {
  const { client, orm } = Route.useLoaderData()
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
    <PGliteProvider db={client}>
      <DatabaseContext.Provider value={orm}>
        <Outlet />
        <TanStackRouterDevtools />
      </DatabaseContext.Provider>
    </PGliteProvider>
  )
}
