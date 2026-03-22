// git blame --porcelain output parser

export type BlameLine = {
  hash: string
  author: string
  authorEmail?: string
  date: Date
  summary: string
  line: number
  authorTz?: string
  previous?: { hash: string; filename: string }
  filename?: string
}

export type BlameResult = BlameLine[]

type CachedCommit = {
  author: string
  authorEmail: string
  authorTime: number
  authorTz: string
  summary: string
  previous?: { hash: string; filename: string }
  filename?: string
}

/**
 * parses `git blame --porcelain` output into an array of BlameLine.
 *
 * porcelain format groups: header line (`hash origLine finalLine [groupLines]`),
 * then key-value pairs (`author`, `author-time`, `summary`, etc.),
 * then the content line prefixed with tab.
 *
 * when a commit spans multiple lines, only the first occurrence has full headers.
 * subsequent lines for the same commit only have the hash header + content line.
 * we use a cache to populate author/date/summary for these continuation lines.
 */
export const parseBlameOutput = (raw: string): BlameResult => {
  if (!raw || !raw.trim()) return []

  const lines = raw.split("\n")
  const result: BlameResult = []
  const commitCache = new Map<string, CachedCommit>()

  let i = 0
  while (i < lines.length) {
    const headerLine = lines[i]
    if (!headerLine || !headerLine.trim()) {
      i++
      continue
    }

    // header: <hash> <origLine> <finalLine> [<groupLines>]
    const headerMatch = headerLine.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/)
    if (!headerMatch) {
      i++
      continue
    }

    const hash = headerMatch[1]
    const finalLine = parseInt(headerMatch[3], 10)

    let author = ""
    let authorEmail = ""
    let authorTime = 0
    let authorTz = ""
    let summary = ""
    let previous: { hash: string; filename: string } | undefined
    let filename: string | undefined

    i++

    // read key-value pairs until we hit the content line (starts with \t)
    while (i < lines.length && !lines[i].startsWith("\t")) {
      const line = lines[i]

      if (line.startsWith("author ")) {
        author = line.slice("author ".length)
      } else if (line.startsWith("author-mail ")) {
        authorEmail = line.slice("author-mail ".length)
      } else if (line.startsWith("author-time ")) {
        authorTime = parseInt(line.slice("author-time ".length), 10)
      } else if (line.startsWith("author-tz ")) {
        authorTz = line.slice("author-tz ".length)
      } else if (line.startsWith("summary ")) {
        summary = line.slice("summary ".length)
      } else if (line.startsWith("previous ")) {
        const rest = line.slice("previous ".length)
        const spaceIdx = rest.indexOf(" ")
        if (spaceIdx !== -1) {
          previous = { hash: rest.slice(0, spaceIdx), filename: rest.slice(spaceIdx + 1) }
        }
      } else if (line.startsWith("filename ")) {
        filename = line.slice("filename ".length)
      }

      i++
    }

    // skip the content line (starts with \t)
    if (i < lines.length && lines[i].startsWith("\t")) {
      i++
    }

    // if we parsed header fields, cache them; otherwise look up the cache
    if (author || authorTime || summary) {
      commitCache.set(hash, {
        author,
        authorEmail,
        authorTime,
        authorTz,
        summary,
        previous,
        filename,
      })
    } else {
      const cached = commitCache.get(hash)
      if (cached) {
        author = cached.author
        authorEmail = cached.authorEmail
        authorTime = cached.authorTime
        authorTz = cached.authorTz
        summary = cached.summary
        previous = cached.previous
        filename = cached.filename
      }
    }

    const blameLine: BlameLine = {
      hash,
      author,
      date: new Date(authorTime * 1000),
      summary,
      line: finalLine,
    }

    if (authorEmail) blameLine.authorEmail = authorEmail
    if (authorTz) blameLine.authorTz = authorTz
    if (previous) blameLine.previous = previous
    if (filename) blameLine.filename = filename

    result.push(blameLine)
  }

  return result
}

/** returns true if the hash represents an uncommitted line */
export const isUncommitted = (hash: string): boolean => /^0+$/.test(hash)
