import { StrictMode } from "react"
import { EditorProvider } from "@/contexts/editor-context"
// Import the generated route tree
import { routeTree } from "@/routeTree.gen"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { PostHogProvider } from "posthog-js/react"
import ReactDOM from "react-dom/client"

import { useTheme } from "@/components/theme-provider"

// Create a new router instance with hash routing
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"], // Pass your initial url
})

const router = createRouter({ routeTree, history: memoryHistory })

const queryClient = new QueryClient()

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
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: "2025-05-24",
        capture_exceptions: true,
        // debug: import.meta.env.MODE === "development",
      }}
    >
      <QueryClientProvider client={queryClient}>
        <EditorProvider>
          <RootWithTheme />
          <ReactQueryDevtools initialIsOpen={false} />
        </EditorProvider>
      </QueryClientProvider>
    </PostHogProvider>
  </StrictMode>
)
