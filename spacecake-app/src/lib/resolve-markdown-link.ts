/**
 * utilities for resolving standard markdown links (`[text](href)`) to
 * workspace-internal file paths. unlike wikilinks (which match by filename
 * using shortest-path resolution), markdown links resolve relative to the
 * current file's directory.
 */

/** protocol scheme regex — matches `https:`, `mailto:`, `javascript:`, etc. */
const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i

/**
 * returns true when `href` points to a workspace-internal path rather than
 * an external URL. any href without a protocol scheme is considered internal.
 */
export function isInternalLink(href: string): boolean {
  if (!href || href.trim() === "") return false
  return !PROTOCOL_RE.test(href)
}

export interface ResolvedMarkdownLink {
  filePath: string
  anchor?: string
}

/**
 * resolve a markdown link href relative to the current file's directory.
 *
 * - splits on the first literal `#` before URL-decoding (so `%23` in a
 *   filename is not confused with an anchor delimiter).
 * - normalises `.` and `..` path segments.
 * - clamps the result to `workspacePath` to prevent path-traversal escapes.
 * - treats `/`-prefixed hrefs as workspace-root-relative.
 */
export function resolveMarkdownLinkHref(
  currentFilePath: string,
  workspacePath: string,
  href: string,
): ResolvedMarkdownLink {
  // split on first literal # to separate path from anchor
  const hashIndex = href.indexOf("#")
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const rawAnchor = hashIndex === -1 ? undefined : href.slice(hashIndex + 1)

  // URL-decode each part independently
  const decodedPath = safeDecodeURIComponent(rawPath)
  const anchor = rawAnchor !== undefined ? safeDecodeURIComponent(rawAnchor) : undefined

  // same-file anchor: #heading
  if (decodedPath === "") {
    return { filePath: currentFilePath, anchor }
  }

  let resolved: string

  if (decodedPath.startsWith("/")) {
    // workspace-root-relative
    resolved = workspacePath + decodedPath
  } else {
    // relative to current file's directory
    const dir = currentFilePath.slice(0, currentFilePath.lastIndexOf("/"))
    resolved = dir + "/" + decodedPath
  }

  // normalise . and .. segments
  resolved = normalisePath(resolved)

  // clamp to workspace root
  if (!resolved.startsWith(workspacePath + "/") && resolved !== workspacePath) {
    resolved = workspacePath
  }

  return { filePath: resolved, anchor }
}

/** normalise a path by resolving `.` and `..` segments. */
function normalisePath(path: string): string {
  const parts = path.split("/")
  const resolved: string[] = []
  for (const part of parts) {
    if (part === "..") {
      // never pop past the first segment (root)
      if (resolved.length > 1) resolved.pop()
    } else if (part !== ".") {
      resolved.push(part)
    }
  }
  return resolved.join("/")
}

/** decode a URI component, returning the original string on failure. */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str)
  } catch {
    return str
  }
}
