import { EditorProvider } from "@/contexts/editor-context"
import { router } from "@/router"
import { RouterProvider } from "@tanstack/react-router"
import { Provider } from "jotai"
import { PostHogProvider } from "posthog-js/react"
import ReactDOM from "react-dom/client"

import { initializeDatabase } from "@/lib/init-database"
import { store } from "@/lib/store"
import { useTheme } from "@/components/theme-provider"

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
  return <RouterProvider router={router} context={{ db }} />
}

const PUBLIC_POSTHOG_KEY = "phc_tie9HcJtBH5SkcTLpsJaUnq7X8adjIpDU4flhefHdWJ"
const PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"

root.render(
  <Provider store={store}>
    <PostHogProvider
      apiKey={PUBLIC_POSTHOG_KEY}
      options={{
        api_host: PUBLIC_POSTHOG_HOST,
        defaults: "2025-05-24",
        capture_exceptions: true,
        cookieless_mode: "always",
        person_profiles: "identified_only",
      }}
    >
      <EditorProvider>
        <RootWithTheme />
      </EditorProvider>
    </PostHogProvider>
  </Provider>
)
