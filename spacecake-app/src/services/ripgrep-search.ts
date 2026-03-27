import { execFile } from "node:child_process"

import { rgPath } from "@vscode/ripgrep"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"

// -- types --

export interface SearchMatch {
  path: string // absolute file path
  lineNumber: number // 1-based
  column: number // 0-based byte offset within the line
  lineContent: string // the full line text
  matchStart: number // start char offset within lineContent
  matchEnd: number // end char offset within lineContent
}

export interface SearchResult {
  file: string // absolute path
  matches: SearchMatch[]
}

export interface SearchOptions {
  query: string
  workspacePath: string
  caseSensitive?: boolean
  regex?: boolean
  includeGlob?: string
  excludeGlob?: string
  maxResults?: number // default 10000
  maxFiles?: number // default 5000
}

// -- error --

export class SearchError extends Data.TaggedError("SearchError")<{
  readonly description: string
}> {}

// -- functions --

/** constructs the ripgrep argument array from search options */
export const buildRgArgs = (options: SearchOptions): string[] => {
  const args: string[] = ["--json", "--max-filesize", "1M", "--hidden"]

  if (options.caseSensitive) {
    args.push("--case-sensitive")
  } else {
    args.push("--ignore-case")
  }

  if (!options.regex) {
    args.push("--fixed-strings")
  }

  // exclude entries from the shared ignore list
  for (const entry of EXCLUDED_ENTRIES) {
    args.push("--glob", `!${entry}`)
  }
  args.push("--glob", "!*.asar")

  if (options.includeGlob) {
    args.push("--glob", options.includeGlob)
  }

  if (options.excludeGlob) {
    args.push("--glob", `!${options.excludeGlob}`)
  }

  // use -e to safely handle patterns starting with -
  args.push("-e", options.query)

  return args
}

// ripgrep json message types
interface RgBeginMessage {
  type: "begin"
  data: { path: { text: string } }
}

interface RgMatchMessage {
  type: "match"
  data: {
    path: { text: string }
    lines: { text: string }
    line_number: number
    submatches: Array<{
      match: { text: string }
      start: number
      end: number
    }>
  }
}

interface RgEndMessage {
  type: "end"
  data: unknown
}

interface RgSummaryMessage {
  type: "summary"
  data: unknown
}

type RgMessage = RgBeginMessage | RgMatchMessage | RgEndMessage | RgSummaryMessage

/** parses ripgrep --json ndjson output into grouped search results */
export const parseRgJson = (
  output: string,
  options: SearchOptions,
): { results: SearchResult[]; limitHit: boolean } => {
  const maxResults = options.maxResults ?? 10_000
  const maxFiles = options.maxFiles ?? 5_000

  const resultsByFile = new Map<string, SearchResult>()
  const fileOrder: string[] = []
  let totalMatches = 0
  let limitHit = false

  const lines = output.split("\n")

  for (const line of lines) {
    if (!line.trim()) continue

    let message: RgMessage
    try {
      message = JSON.parse(line) as RgMessage
    } catch {
      // skip malformed json lines
      continue
    }

    if (message.type === "summary") {
      continue
    }

    if (message.type === "begin") {
      const filePath = message.data.path.text

      if (!resultsByFile.has(filePath)) {
        if (fileOrder.length >= maxFiles) {
          limitHit = true
          break
        }
        resultsByFile.set(filePath, { file: filePath, matches: [] })
        fileOrder.push(filePath)
      }
      continue
    }

    if (message.type === "match") {
      if (totalMatches >= maxResults) {
        limitHit = true
        break
      }

      const filePath = message.data.path.text
      const lineContent = message.data.lines.text.replace(/\n$/, "")

      if (!resultsByFile.has(filePath)) {
        if (fileOrder.length >= maxFiles) {
          limitHit = true
          break
        }
        resultsByFile.set(filePath, { file: filePath, matches: [] })
        fileOrder.push(filePath)
      }

      const result = resultsByFile.get(filePath)!

      for (const submatch of message.data.submatches) {
        if (totalMatches >= maxResults) {
          limitHit = true
          break
        }

        result.matches.push({
          path: filePath,
          lineNumber: message.data.line_number,
          column: submatch.start,
          lineContent,
          matchStart: submatch.start,
          matchEnd: submatch.end,
        })
        totalMatches++
      }

      if (limitHit) break
      continue
    }

    // type "end" — nothing to do
  }

  const results = fileOrder.map((file) => resultsByFile.get(file)!)

  return { results, limitHit }
}

/** runs a workspace-wide ripgrep search */
export const search = (
  options: SearchOptions,
): Effect.Effect<{ results: SearchResult[]; limitHit: boolean }, SearchError> => {
  if (!options.query) {
    return Effect.succeed({ results: [], limitHit: false })
  }

  const args = buildRgArgs(options)

  return Effect.async<{ results: SearchResult[]; limitHit: boolean }, SearchError>((resume) => {
    const child = execFile(
      rgPath,
      args,
      { cwd: options.workspacePath, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout) => {
        // exit code 1 means no matches found — not an error
        if (error && "code" in error && error.code === 1) {
          resume(Effect.succeed({ results: [], limitHit: false }))
          return
        }

        // exit code 2+ is a real error
        if (error) {
          resume(
            Effect.fail(
              new SearchError({
                description: `ripgrep search failed: ${String(error)}`,
              }),
            ),
          )
          return
        }

        resume(Effect.succeed(parseRgJson(stdout, options)))
      },
    )

    // kill the ripgrep process on fiber interruption
    return Effect.sync(() => child.kill())
  })
}
