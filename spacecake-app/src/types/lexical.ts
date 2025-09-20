// minimal, typesafe helpers for lexical update tags used in the app

export const INITIAL_LOAD_TAG = "initial-load" as const
export type InitialLoadTag = typeof INITIAL_LOAD_TAG

export function hasInitialLoadTag(tags: ReadonlySet<string>): boolean {
  return tags.has(INITIAL_LOAD_TAG)
}

// view kinds for editor modes
export type ViewKind = "rich" | "source"
