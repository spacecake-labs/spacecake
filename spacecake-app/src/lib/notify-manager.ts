/**
 * microtask-based notification batcher.
 *
 * when multiple live query stores update in rapid succession (e.g. after a
 * single write touches a shared table), the notify manager coalesces their
 * listener callbacks into a single synchronous flush. because all callbacks
 * execute synchronously within one microtask, react 19 batches them into a
 * single render pass.
 *
 * inspired by TanStack Query's notifyManager.
 */

type NotifyCallback = () => void

function createNotifyManager() {
  let queue: NotifyCallback[] = []
  let scheduled = false

  const flush = () => {
    scheduled = false
    const callbacks = queue
    queue = []
    for (const cb of callbacks) {
      cb()
    }
  }

  const scheduleFlush = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(flush)
  }

  return {
    schedule(callback: NotifyCallback): void {
      queue.push(callback)
      scheduleFlush()
    },
  }
}

export const notifyManager = createNotifyManager()
