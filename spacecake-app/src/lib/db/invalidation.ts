import { MUTATION_INVALIDATION_MAP } from "@/lib/db/mutation-methods"
import { queryClient } from "@/lib/db/query-client"

/**
 * invalidates TanStack Query caches for collections affected by a mutation.
 * called from the db:invalidate IPC channel.
 */
const invalidate = (mutationMethod: string): void => {
  const keys = MUTATION_INVALIDATION_MAP[mutationMethod as keyof typeof MUTATION_INVALIDATION_MAP]
  if (!keys) return
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
}

/** connect to the main-process invalidation channel (idempotent, HMR-safe) */
let cleanup: (() => void) | null = null
export const connectInvalidation = (): void => {
  cleanup?.()
  cleanup = window.electronAPI.db.onInvalidate(invalidate)
}
