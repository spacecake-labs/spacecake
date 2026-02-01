/**
 * Suppresses duplicate console logs matching a pattern.
 * First N unique occurrences are logged, subsequent ones are silenced.
 * Once maxUnique is reached, all matching logs are suppressed.
 *
 * @param pattern - RegExp to match log messages
 * @param maxUnique - Maximum unique logs to log before suppressing all (default: 5)
 * @returns Cleanup function to restore original console.log
 */
export function suppressDuplicateWarnings(pattern: RegExp, maxUnique: number = 5): () => void {
  const seen = new Set<string>()
  const originalLog = console.log

  console.log = (...args: unknown[]) => {
    const msg = String(args[0])

    if (pattern.test(msg)) {
      // Once we've logged maxUnique logs, suppress everything
      if (seen.size >= maxUnique) return

      const key = msg.slice(0, 100)
      if (seen.has(key)) return

      seen.add(key)
      originalLog.apply(console, args)
      return
    }

    originalLog.apply(console, args)
  }

  return () => {
    console.log = originalLog
  }
}
