import type { LiveQuery, LiveQueryResults, PGliteWithLive } from "@electric-sql/pglite/live"

import { notifyManager } from "@/lib/notify-manager"
import { replaceEqualDeep } from "@/lib/structural-sharing"

type Listener = () => void

/**
 * wraps an async PGlite live query subscription and exposes synchronous
 * `subscribe` / `getSnapshot` methods for `useSyncExternalStore`.
 *
 * applies structural sharing so unchanged subtrees preserve reference
 * identity, preventing unnecessary re-renders downstream.
 *
 * routes listener notifications through the global `notifyManager` so
 * that simultaneous updates across multiple stores are flushed together
 * in a single microtask (one react render pass).
 */
export class LiveQueryStore<T> {
  private snapshot: LiveQueryResults<T> | undefined
  private listeners = new Set<Listener>()
  private liveQuery: LiveQuery<T> | null = null
  private disposed = false

  constructor(initialSnapshot?: LiveQueryResults<T>) {
    this.snapshot = initialSnapshot
  }

  /** synchronous subscribe for useSyncExternalStore. stable reference. */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** synchronous snapshot reader for useSyncExternalStore. stable reference. */
  readonly getSnapshot = (): LiveQueryResults<T> | undefined => {
    return this.snapshot
  }

  /**
   * start the async pglite subscription.
   * when `key` is provided, uses `live.incrementalQuery` which diffs inside
   * postgres and only patches the changed rows — less wasm work per update.
   */
  async connect(db: PGliteWithLive, sql: string, params: unknown[], key?: string): Promise<void> {
    if (this.disposed) return

    let liveQuery: LiveQuery<T>
    try {
      liveQuery = key
        ? await db.live.incrementalQuery<T>(sql, params, key)
        : await db.live.query<T>(sql, params)
    } catch (error) {
      if (!this.disposed) {
        console.error("live query failed:", error)
      }
      return
    }

    if (this.disposed) {
      await liveQuery.unsubscribe()
      return
    }

    this.liveQuery = liveQuery
    this.applyUpdate(liveQuery.initialResults)

    liveQuery.subscribe((newResults: LiveQueryResults<T>) => {
      if (this.disposed) return
      this.applyUpdate(newResults)
    })
  }

  /** tear down the pglite subscription and prevent further updates. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
    if (this.liveQuery) {
      await this.liveQuery.unsubscribe()
      this.liveQuery = null
    }
  }

  private applyUpdate(newResults: LiveQueryResults<T>): void {
    const shared = replaceEqualDeep(this.snapshot, newResults)
    if (shared === this.snapshot) return

    this.snapshot = shared

    notifyManager.schedule(() => {
      for (const listener of this.listeners) {
        listener()
      }
    })
  }
}
