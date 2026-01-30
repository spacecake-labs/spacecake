import { useEffect, useRef, useState } from "react"
import { usePGlite } from "@electric-sql/pglite-react"
import type { LiveQueryResults } from "@electric-sql/pglite/live"

import { replaceEqualDeep } from "@/lib/structural-sharing"

/**
 * A wrapper around PGlite's live.query that applies structural sharing
 * to prevent unnecessary re-renders when data hasn't changed.
 */
export function useStableLiveQuery<T>(
  sql: string,
  params?: unknown[]
): LiveQueryResults<T> | undefined {
  const db = usePGlite()
  const [results, setResults] = useState<LiveQueryResults<T> | undefined>()
  const prevResultsRef = useRef<LiveQueryResults<T> | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => Promise<void>) | undefined

    const setup = async () => {
      const liveQuery = await db.live.query<T>(sql, params ?? [])

      if (cancelled) {
        await liveQuery.unsubscribe()
        return
      }

      // Handle initial results
      const initialShared = replaceEqualDeep(
        prevResultsRef.current,
        liveQuery.initialResults
      )
      if (initialShared !== prevResultsRef.current) {
        prevResultsRef.current = initialShared
        setResults(initialShared)
      }

      // Subscribe to updates
      const callback = (newResults: LiveQueryResults<T>) => {
        if (cancelled) return

        // Apply structural sharing to preserve references when data is equal
        const shared = replaceEqualDeep(prevResultsRef.current, newResults)

        // Only update state if the reference actually changed
        if (shared !== prevResultsRef.current) {
          prevResultsRef.current = shared
          setResults(shared)
        }
      }

      liveQuery.subscribe(callback)
      unsubscribe = () => liveQuery.unsubscribe(callback)
    }

    setup()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [db, sql, JSON.stringify(params)])

  return results
}
