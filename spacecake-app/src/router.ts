import { createMemoryHistory, createRouter } from "@tanstack/react-router"

import type { DatabaseInstance } from "@/lib/init-database"

// Import the generated route tree
import { routeTree } from "@/routeTree.gen"

export type RouterContext = {
  db: DatabaseInstance
}

const memoryHistory = createMemoryHistory({
  initialEntries: ["/"],
})

export const router = createRouter({
  routeTree,
  history: memoryHistory,
  defaultStructuralSharing: true,
  defaultPreload: false,
  context: undefined!,
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
