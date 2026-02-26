import type { PostHog } from "posthog-js"

import { RouterProvider } from "@tanstack/react-router"
import { Provider } from "jotai"
import { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"

import { useTheme } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { EditorProvider } from "@/contexts/editor-context"
import { initializeDatabase } from "@/lib/init-database"
import { store } from "@/lib/store"
import { router } from "@/router"

// initialize database before rendering
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
    Promise.all([import("posthog-js/react"), import("@/lib/posthog-client")]).then(
      ([reactMod, clientMod]) => {
        setCtx({ Provider: reactMod.PostHogProvider, client: clientMod.initPostHog() })
      },
    )
  }, [])

  if (!ctx) return <>{children}</>

  return <ctx.Provider client={ctx.client}>{children}</ctx.Provider>
}

function RootWithTheme() {
  const { theme } = useTheme()
  // set class on body; tailwind v4 supports .dark variants via :root class as well,
  // but body works given our globals.css @custom-variant
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(theme)
  window.electronAPI.setTitleBarOverlay(theme === "dark")
  return (
    <>
      <RouterProvider router={router} context={{ db }} />
      <Toaster />
    </>
  )
}

root.render(
  <Provider store={store}>
    <DeferredPostHogProvider>
      <EditorProvider>
        <RootWithTheme />
      </EditorProvider>
    </DeferredPostHogProvider>
  </Provider>,
)
