import { EditorProvider } from "@/contexts/editor-context"
// Import the generated route tree
import { routeTree } from "@/routeTree.gen"
import { Database } from "@/services/database"
import { Migrations } from "@/services/migrations"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { Effect } from "effect"
import { Provider } from "jotai"
import { PostHogProvider } from "posthog-js/react"
import ReactDOM from "react-dom/client"

import { store } from "@/lib/store"
import { useTheme } from "@/components/theme-provider"

// Create a new router instance with hash routing
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"], // Pass your initial url
})

const db = RuntimeClient.runPromise(
  Effect.gen(function* () {
    const migration = yield* Migrations
    yield* migration.apply
    return yield* Database
  })
)

const router = createRouter({
  routeTree,
  history: memoryHistory,
  context: { db },
})

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById("root")!
const root = ReactDOM.createRoot(rootElement)
function RootWithTheme() {
  const { theme } = useTheme()
  // set class on body; tailwind v4 supports .dark variants via :root class as well,
  // but body works given our globals.css @custom-variant
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(theme)
  return <RouterProvider router={router} />
}

root.render(
  // <StrictMode>
  <Provider store={store}>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: "2025-05-24",
        capture_exceptions: true,
        // debug: import.meta.env.MODE === "development",
      }}
    >
      <EditorProvider>
        <RootWithTheme />
      </EditorProvider>
    </PostHogProvider>
  </Provider>
  // </StrictMode>
)
