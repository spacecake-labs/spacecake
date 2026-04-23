export const CALLOUT_TYPES = [
  "note",
  "abstract",
  "info",
  "todo",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
] as const

export type CalloutType = (typeof CALLOUT_TYPES)[number]

const CALLOUT_ALIASES: Record<string, CalloutType> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
}

const CANONICAL_SET = new Set<string>(CALLOUT_TYPES)

export function normalizeCalloutType(raw: string): CalloutType {
  const lower = raw.toLowerCase()
  if (CANONICAL_SET.has(lower)) return lower as CalloutType
  if (lower in CALLOUT_ALIASES) return CALLOUT_ALIASES[lower]
  return "note"
}

export function getDefaultTitle(type: CalloutType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}
