// Import the generated route tree
import { routeTree } from "@/routeTree.gen"
import { createMemoryHistory, createRouter } from "@tanstack/react-router"

// Create a new router instance with hash routing
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"], // Pass your initial url
})

export const router = createRouter({
  routeTree,
  history: memoryHistory,
  defaultStructuralSharing: true,
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
