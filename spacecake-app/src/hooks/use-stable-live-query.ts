import type { LiveQueryResults } from "@electric-sql/pglite/live"

import { usePGlite } from "@electric-sql/pglite-react"
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"

import { LiveQueryStore } from "@/lib/live-query-store"

/**
 * a wrapper around PGlite's live.query that uses `useSyncExternalStore`
 * for tear-free reads and a global notification manager for batched
 * re-renders across multiple simultaneous live query subscriptions.
 *
 * structural sharing (via `replaceEqualDeep`) preserves reference identity
 * for unchanged subtrees, preventing unnecessary downstream re-renders.
 */
export function useStableLiveQuery<T>(
  sql: string,
  params?: unknown[],
  key?: string,
): LiveQueryResults<T> | undefined {
  const db = usePGlite()
  const paramsKey = JSON.stringify(params)
  const prevStoreRef = useRef<LiveQueryStore<T> | null>(null)

  // create a new store when query identity changes.
  // construction is pure (no side effects), so safe in useMemo.
  // seed with the previous store's snapshot to avoid a loading flash
  // when only the params change but data is structurally equal.
  const store = useMemo(() => {
    const prev = prevStoreRef.current?.getSnapshot()
    return new LiveQueryStore<T>(prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paramsKey is a stable serialization of params
  }, [db, sql, paramsKey])

  prevStoreRef.current = store

  // manage the async pglite subscription lifecycle
  useEffect(() => {
    store.connect(db, sql, params ?? [], key)
    return () => {
      store.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store changes when db/sql/params change, so it is a sufficient dependency
  }, [store])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
