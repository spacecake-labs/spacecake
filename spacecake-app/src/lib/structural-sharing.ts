function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Structural sharing: replaces deeply equal children of `b` with references from `a`.
 * If `a` and `b` are deeply equal, returns `a` (preserving reference identity).
 *
 * From TanStack Query - https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
 */
export function replaceEqualDeep<T>(a: unknown, b: T, depth = 0): T {
  if (a === b) return a as T
  if (depth > 500) return b

  const array = isPlainArray(a) && isPlainArray(b)
  if (!array && !(isPlainObject(a) && isPlainObject(b))) return b

  const aItems = array ? (a as unknown[]) : Object.keys(a as object)
  const aSize = aItems.length
  const bItems = array ? (b as unknown[]) : Object.keys(b as object)
  const bSize = bItems.length
  const copy: unknown[] | Record<string, unknown> = array
    ? new Array(bSize)
    : {}

  let equalItems = 0

  for (let i = 0; i < bSize; i++) {
    const key = array ? i : (bItems as string[])[i]
    const aItem = (a as Record<string | number, unknown>)[key]
    const bItem = (b as Record<string | number, unknown>)[key]

    if (aItem === bItem) {
      ;(copy as Record<string | number, unknown>)[key] = aItem
      if (array ? i < aSize : Object.hasOwn(a as object, key)) equalItems++
      continue
    }

    if (
      aItem === null ||
      bItem === null ||
      typeof aItem !== "object" ||
      typeof bItem !== "object"
    ) {
      ;(copy as Record<string | number, unknown>)[key] = bItem
      continue
    }

    const v = replaceEqualDeep(aItem, bItem, depth + 1)
    ;(copy as Record<string | number, unknown>)[key] = v
    if (v === aItem) equalItems++
  }

  return (aSize === bSize && equalItems === aSize ? a : copy) as T
}
