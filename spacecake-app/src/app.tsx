import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { Provider } from "jotai"
import type { PostHog } from "posthog-js"
import { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"

import { useTheme } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { EditorProvider } from "@/contexts/editor-context"
import { connectInvalidation } from "@/lib/db/invalidation"
import { queryClient } from "@/lib/db/query-client"
import { initializeDatabase } from "@/lib/init-database"
import { store } from "@/lib/store"
import { router } from "@/router"

// connect IPC invalidation channel (routes mutations to TanStack Query cache invalidation)
connectInvalidation()

// initialize the database IPC proxy
const db = await initializeDatabase()

const rootElement = document.getElementById("root")!
const root = ReactDOM.createRoot(rootElement)

function DeferredPostHogProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Provider: React.ComponentType<{ client: PostHog; children: React.ReactNode }>
    client: PostHog
  } | null>(null)

  useEffect(() => {
    Promise.all([import("posthog-js/react"), import("@/lib/posthog-client")])
      .then(([reactMod, clientMod]) => {
        setCtx({ Provider: reactMod.PostHogProvider, client: clientMod.initPostHog() })
      })
      .catch(() => {
        // posthog failed to load — app continues without analytics
      })
  }, [])

  if (!ctx) return <>{children}</>

  return <ctx.Provider client={ctx.client}>{children}</ctx.Provider>
}

function RootWithTheme() {
  const { theme } = useTheme()

  // apply theme class and title bar overlay as a side effect (not during render)
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(theme)
    window.electronAPI.setTitleBarOverlay(theme === "dark")
  }, [theme])

  return (
    <>
      <RouterProvider router={router} context={{ db }} />
      <Toaster />
    </>
  )
}

root.render(
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <DeferredPostHogProvider>
        <EditorProvider>
          <RootWithTheme />
        </EditorProvider>
      </DeferredPostHogProvider>
    </Provider>
  </QueryClientProvider>,
)
