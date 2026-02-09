import { RouterProvider } from "@tanstack/react-router"
import { Provider } from "jotai"
import { PostHogProvider } from "posthog-js/react"
import ReactDOM from "react-dom/client"

import { useTheme } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { EditorProvider } from "@/contexts/editor-context"
import { initializeDatabase } from "@/lib/init-database"
import posthog from "@/lib/posthog-client"
import { store } from "@/lib/store"
import { router } from "@/router"

// initialize database before rendering
const db = await initializeDatabase()

const rootElement = document.getElementById("root")!
const root = ReactDOM.createRoot(rootElement)

function RootWithTheme() {
  const { theme } = useTheme()
  // set class on body; tailwind v4 supports .dark variants via :root class as well,
  // but body works given our globals.css @custom-variant
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(theme)
  return (
    <>
      <RouterProvider router={router} context={{ db }} />
      <Toaster />
    </>
  )
}

root.render(
  <Provider store={store}>
    <PostHogProvider client={posthog}>
      <EditorProvider>
        <RootWithTheme />
      </EditorProvider>
    </PostHogProvider>
  </Provider>,
)
