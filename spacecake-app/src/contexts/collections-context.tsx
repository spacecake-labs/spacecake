import { createContext, useContext } from "react"

import type { WorkspaceCollections } from "@/lib/db/collections"

const CollectionsContext = createContext<WorkspaceCollections | null>(null)

export function CollectionsProvider({
  collections,
  children,
}: {
  collections: WorkspaceCollections
  children: React.ReactNode
}) {
  return <CollectionsContext.Provider value={collections}>{children}</CollectionsContext.Provider>
}

export function useCollections(): WorkspaceCollections {
  const ctx = useContext(CollectionsContext)
  if (!ctx) {
    throw new Error("useCollections must be used within a CollectionsProvider")
  }
  return ctx
}
