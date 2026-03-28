import { spawn } from "node:child_process"
import { join } from "node:path"
import { StringDecoder } from "node:string_decoder"

import { rgPath } from "@vscode/ripgrep"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"

// max characters to keep per line in search results.
// prevents v8 structured clone crashes when ripgrep matches minified files
// (a single minified line can be megabytes long).
const MAX_LINE_CONTENT_LENGTH = 500

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
  const args: string[] = [
    "--json",
    "--max-filesize",
    "1M",
    "--max-columns",
    String(MAX_LINE_CONTENT_LENGTH * 4),
    "--max-columns-preview",
    "--hidden",
  ]

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

  // prevent user ripgrep config from interfering
  args.push("--no-config")

  // use -e to safely handle patterns starting with -
  args.push("-e", options.query)

  // explicit search path after end-of-options separator
  args.push("--", ".")

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

// -- incremental parsing --

/** mutable accumulator used by parseLine for incremental parsing */
export interface ParseState {
  rootPath: string
  resultsByFile: Map<string, SearchResult>
  fileOrder: string[]
  totalMatches: number
  limitHit: boolean
}

export const createParseState = (rootPath: string): ParseState => ({
  rootPath,
  resultsByFile: new Map(),
  fileOrder: [],
  totalMatches: 0,
  limitHit: false,
})

/**
 * parses a single ndjson line from ripgrep --json output.
 * mutates state in place. returns true if parsing should continue,
 * false if a limit was hit and the caller should stop/kill the process.
 */
export const parseLine = (
  line: string,
  state: ParseState,
  maxResults: number,
  maxFiles: number,
): boolean => {
  if (!line.trim()) return true

  let message: RgMessage
  try {
    message = JSON.parse(line) as RgMessage
  } catch {
    return true // skip malformed json lines
  }

  if (message.type === "summary") return true

  if (message.type === "begin") {
    const filePath = join(state.rootPath, message.data.path.text)

    if (!state.resultsByFile.has(filePath)) {
      if (state.fileOrder.length >= maxFiles) {
        state.limitHit = true
        return false
      }
      state.resultsByFile.set(filePath, { file: filePath, matches: [] })
      state.fileOrder.push(filePath)
    }
    return true
  }

  if (message.type === "match") {
    if (state.totalMatches >= maxResults) {
      state.limitHit = true
      return false
    }

    const filePath = join(state.rootPath, message.data.path.text)
    const rawLine = message.data.lines.text.replace(/\n$/, "")

    if (!state.resultsByFile.has(filePath)) {
      if (state.fileOrder.length >= maxFiles) {
        state.limitHit = true
        return false
      }
      state.resultsByFile.set(filePath, { file: filePath, matches: [] })
      state.fileOrder.push(filePath)
    }

    const result = state.resultsByFile.get(filePath)!

    for (const submatch of message.data.submatches) {
      if (state.totalMatches >= maxResults) {
        state.limitHit = true
        return false
      }

      // truncate long lines (e.g. minified files) to prevent v8 serialization crashes.
      // keep a window around the match so the highlight stays visible.
      let lineContent = rawLine
      let matchStart = submatch.start
      let matchEnd = submatch.end

      if (rawLine.length > MAX_LINE_CONTENT_LENGTH) {
        const matchMid = Math.floor((submatch.start + submatch.end) / 2)
        const halfWindow = Math.floor(MAX_LINE_CONTENT_LENGTH / 2)
        const windowStart = Math.max(0, matchMid - halfWindow)
        const windowEnd = Math.min(rawLine.length, windowStart + MAX_LINE_CONTENT_LENGTH)

        lineContent = rawLine.slice(windowStart, windowEnd)
        matchStart = submatch.start - windowStart
        matchEnd = submatch.end - windowStart
      }

      result.matches.push({
        path: filePath,
        lineNumber: message.data.line_number,
        column: submatch.start,
        lineContent,
        matchStart,
        matchEnd,
      })
      state.totalMatches++
    }

    return !state.limitHit
  }

  // type "end" — nothing to do
  return true
}

/** converts parse state into the final results array */
export const finalizeParseState = (
  state: ParseState,
): { results: SearchResult[]; limitHit: boolean } => ({
  results: state.fileOrder.map((file) => state.resultsByFile.get(file)!),
  limitHit: state.limitHit,
})

/** parses ripgrep --json ndjson output into grouped search results */
export const parseRgJson = (
  output: string,
  options: SearchOptions,
): { results: SearchResult[]; limitHit: boolean } => {
  const maxResults = options.maxResults ?? 10_000
  const maxFiles = options.maxFiles ?? 5_000
  const state = createParseState(options.workspacePath)

  for (const line of output.split("\n")) {
    if (!parseLine(line, state, maxResults, maxFiles)) break
  }

  return finalizeParseState(state)
}

/** runs a workspace-wide ripgrep search */
export const search = (
  options: SearchOptions,
): Effect.Effect<{ results: SearchResult[]; limitHit: boolean }, SearchError> => {
  if (!options.query) {
    return Effect.succeed({ results: [], limitHit: false })
  }

  const args = buildRgArgs(options)
  const maxResults = options.maxResults ?? 10_000
  const maxFiles = options.maxFiles ?? 5_000

  return Effect.async<{ results: SearchResult[]; limitHit: boolean }, SearchError>((resume) => {
    const state = createParseState(options.workspacePath)
    const decoder = new StringDecoder("utf8")
    let remainder = ""
    const stderrChunks: string[] = []
    let killed = false

    const rgProc = spawn(rgPath, args, {
      cwd: options.workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
    })

    rgProc.stdout.on("data", (chunk: Buffer) => {
      const text = remainder + decoder.write(chunk)
      const lines = text.split("\n")
      // last element is either empty (if chunk ended with \n) or an incomplete line
      remainder = lines.pop()!

      for (const line of lines) {
        if (!parseLine(line, state, maxResults, maxFiles)) {
          killed = true
          rgProc.kill()
          return
        }
      }
    })

    rgProc.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString())
    })

    rgProc.on("close", (code: number | null) => {
      // process any remaining partial line
      const final = remainder + decoder.end()
      if (final.trim()) {
        parseLine(final, state, maxResults, maxFiles)
      }

      // exit code 1 = no matches found (not an error)
      if (code === 1) {
        resume(Effect.succeed({ results: [], limitHit: false }))
        return
      }

      // killed because of a limit hit — success with limitHit
      if (killed) {
        resume(Effect.succeed(finalizeParseState(state)))
        return
      }

      // exit code 2+ is a real error
      if (code !== null && code !== 0) {
        const stderr = stderrChunks.join("")
        resume(
          Effect.fail(
            new SearchError({
              description: `ripgrep exited with code ${code}: ${stderr || "(no stderr)"}`,
            }),
          ),
        )
        return
      }

      // exit code 0 or null (signal kill): normal completion
      resume(Effect.succeed(finalizeParseState(state)))
    })

    rgProc.on("error", (err: Error) => {
      resume(
        Effect.fail(
          new SearchError({
            description: `ripgrep failed to start: ${err.message}`,
          }),
        ),
      )
    })

    // kill the ripgrep process on fiber interruption
    return Effect.sync(() => {
      killed = true
      rgProc.kill()
    })
  })
}
