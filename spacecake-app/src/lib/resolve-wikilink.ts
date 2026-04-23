import type { IndexedFile } from "@/services/file-system"
import { type Either, left, right } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

export type WikiLinkAnchor = { kind: "heading"; value: string } | { kind: "block"; value: string }

export type ResolvedWikiLink = {
  filePath: AbsolutePath
  anchor: WikiLinkAnchor | null
}

export type BrokenWikiLink = {
  reason: "not-found" | "ambiguous" | "self-link"
  target: string
}

/**
 * parse the anchor portion of a wikilink target (the part after `#`).
 * returns null if there is no anchor.
 */
function parseAnchor(raw: string | undefined): WikiLinkAnchor | null {
  if (!raw) return null
  if (raw.startsWith("^")) return { kind: "block", value: raw.slice(1) }
  return { kind: "heading", value: raw }
}

/**
 * strip a trailing `.md` extension for comparison, so `[[note]]` and `[[note.md]]`
 * resolve to the same file.
 */
export function normalizeFileName(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name
}

/**
 * resolve a wikilink target string to an absolute file path using
 * "shortest unique path" matching: match by filename (case-insensitive),
 * preferring the shortest path when multiple files share the same name.
 *
 * returns Either<BrokenWikiLink, ResolvedWikiLink>.
 */
export function resolveWikiLink(
  target: string,
  files: IndexedFile[],
): Either<BrokenWikiLink, ResolvedWikiLink> {
  // split on first # to separate filename from anchor
  const hashIndex = target.indexOf("#")
  const filenamePart = hashIndex === -1 ? target : target.slice(0, hashIndex)
  const anchorPart = hashIndex === -1 ? undefined : target.slice(hashIndex + 1)
  const anchor = parseAnchor(anchorPart)

  // same-file anchor link: [[#heading]] or [[#^block]]
  // the caller handles these with the current file context — we can't resolve them here.
  if (filenamePart === "") {
    return left({ reason: "self-link", target })
  }

  const normalizedTarget = normalizeFileName(filenamePart).toLowerCase()

  // find all files whose name matches (case-insensitive, ignoring .md extension)
  const matches = files.filter((f) => normalizeFileName(f.name).toLowerCase() === normalizedTarget)

  if (matches.length === 0) {
    return left({ reason: "not-found", target })
  }

  if (matches.length === 1) {
    return right({ filePath: AbsolutePath(matches[0].path), anchor })
  }

  // multiple matches: prefer the shortest path (closest to workspace root).
  // if two files have the same path length, the match is ambiguous.
  const sorted = [...matches].sort((a, b) => a.path.length - b.path.length)
  if (sorted[0].path.length < sorted[1].path.length) {
    return right({ filePath: AbsolutePath(sorted[0].path), anchor })
  }

  return left({ reason: "ambiguous", target })
}

/** pre-indexed file map keyed by normalized lowercase filename (without .md) */
export type WikiLinkFileIndex = Map<string, IndexedFile[]>

/**
 * build a lookup map from the flat file list. each key is the normalized
 * lowercase filename (without .md extension), mapping to all files that share
 * that name. building the map is O(n); subsequent lookups are O(1).
 */
export function buildFileIndex(files: IndexedFile[]): WikiLinkFileIndex {
  const map = new Map<string, IndexedFile[]>()
  for (const f of files) {
    const key = normalizeFileName(f.name).toLowerCase()
    const arr = map.get(key)
    if (arr) {
      arr.push(f)
    } else {
      map.set(key, [f])
    }
  }
  return map
}

/**
 * resolve a wikilink target using a pre-built index map.
 * O(1) lookup + O(k) sort where k is the number of files with the same name
 * (typically 1). use this instead of `resolveWikiLink` when resolving many
 * links against the same file list.
 */
export function resolveWikiLinkIndexed(
  target: string,
  index: WikiLinkFileIndex,
): Either<BrokenWikiLink, ResolvedWikiLink> {
  const hashIndex = target.indexOf("#")
  const filenamePart = hashIndex === -1 ? target : target.slice(0, hashIndex)
  const anchorPart = hashIndex === -1 ? undefined : target.slice(hashIndex + 1)
  const anchor = parseAnchor(anchorPart)

  if (filenamePart === "") {
    return left({ reason: "self-link", target })
  }

  const normalizedTarget = normalizeFileName(filenamePart).toLowerCase()
  const matches = index.get(normalizedTarget)

  if (!matches || matches.length === 0) {
    return left({ reason: "not-found", target })
  }

  if (matches.length === 1) {
    return right({ filePath: AbsolutePath(matches[0].path), anchor })
  }

  const sorted = [...matches].sort((a, b) => a.path.length - b.path.length)
  if (sorted[0].path.length < sorted[1].path.length) {
    return right({ filePath: AbsolutePath(sorted[0].path), anchor })
  }

  return left({ reason: "ambiguous", target })
}

/**
 * resolve a same-file anchor link. the caller provides the current file's path
 * so the result always resolves.
 */
export function resolveSelfLink(
  currentFilePath: AbsolutePath,
  anchor: WikiLinkAnchor,
): ResolvedWikiLink {
  return { filePath: currentFilePath, anchor }
}
