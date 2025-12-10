import { EditorProvider } from "@/contexts/editor-context"
import { router } from "@/router"
// Import the generated route tree
import { RouterProvider } from "@tanstack/react-router"
import { Provider } from "jotai"
import { PostHogProvider } from "posthog-js/react"
import ReactDOM from "react-dom/client"

import { store } from "@/lib/store"
import { useTheme } from "@/components/theme-provider"

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

const PUBLIC_POSTHOG_KEY = "phc_tie9HcJtBH5SkcTLpsJaUnq7X8adjIpDU4flhefHdWJ"
const PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"

root.render(
  // <StrictMode>
  <Provider store={store}>
    <PostHogProvider
      apiKey={PUBLIC_POSTHOG_KEY}
      options={{
        api_host: PUBLIC_POSTHOG_HOST,
        defaults: "2025-05-24",
        capture_exceptions: true,
        cookieless_mode: "always",
        person_profiles: "identified_only",
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
