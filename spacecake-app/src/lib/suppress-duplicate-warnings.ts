/**
 * Suppresses duplicate console warnings matching a pattern.
 * First N unique occurrences are logged, subsequent ones are silenced.
 * Once maxUnique is reached, all matching warnings are suppressed.
 *
 * @param pattern - RegExp to match warning messages
 * @param maxUnique - Maximum unique warnings to log before suppressing all (default: 5)
 * @returns Cleanup function to restore original console.warn
 */
export function suppressDuplicateWarnings(
  pattern: RegExp,
  maxUnique: number = 5
): () => void {
  const seen = new Set<string>()
  const originalWarn = console.warn

  console.warn = (...args: unknown[]) => {
    const msg = String(args[0])

    if (pattern.test(msg)) {
      // Once we've logged maxUnique warnings, suppress everything
      if (seen.size >= maxUnique) return

      const key = msg.slice(0, 100)
      if (seen.has(key)) return

      seen.add(key)
      originalWarn.apply(console, args)
      return
    }

    originalWarn.apply(console, args)
  }

  return () => {
    console.warn = originalWarn
  }
}
