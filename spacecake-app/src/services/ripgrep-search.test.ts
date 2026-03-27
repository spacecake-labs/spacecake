import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"
import {
  buildRgArgs,
  createParseState,
  finalizeParseState,
  parseLine,
  parseRgJson,
  type SearchOptions,
} from "@/services/ripgrep-search"

// -- unit tests: buildRgArgs --

describe("buildRgArgs", () => {
  const baseOptions: SearchOptions = {
    query: "hello",
    workspacePath: "/home/user/projects",
  }

  it("includes --json, --hidden, --fixed-strings, -e, and query for basic search", () => {
    const args = buildRgArgs(baseOptions)

    expect(args).toContain("--json")
    expect(args).toContain("--hidden")
    expect(args).toContain("--fixed-strings")
    expect(args).toContain("-e")

    const eIndex = args.indexOf("-e")
    expect(args[eIndex + 1]).toBe("hello")
  })

  it("includes --case-sensitive when caseSensitive is true", () => {
    const args = buildRgArgs({ ...baseOptions, caseSensitive: true })

    expect(args).toContain("--case-sensitive")
    expect(args).not.toContain("--ignore-case")
  })

  it("includes --ignore-case when caseSensitive is false", () => {
    const args = buildRgArgs({ ...baseOptions, caseSensitive: false })

    expect(args).toContain("--ignore-case")
    expect(args).not.toContain("--case-sensitive")
  })

  it("does not include --fixed-strings when regex is true", () => {
    const args = buildRgArgs({ ...baseOptions, regex: true })

    expect(args).not.toContain("--fixed-strings")
  })

  it("includes --glob for includeGlob", () => {
    const args = buildRgArgs({ ...baseOptions, includeGlob: "*.ts" })

    const globIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "--glob" && args[i + 1] === "*.ts") acc.push(i)
      return acc
    }, [])

    expect(globIndices.length).toBe(1)
  })

  it("includes --glob with ! prefix for excludeGlob", () => {
    const args = buildRgArgs({ ...baseOptions, excludeGlob: "*.test.ts" })

    const globIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "--glob" && args[i + 1] === "!*.test.ts") acc.push(i)
      return acc
    }, [])

    expect(globIndices.length).toBe(1)
  })

  it("includes a --glob exclusion for each EXCLUDED_ENTRIES entry", () => {
    const args = buildRgArgs(baseOptions)

    for (const entry of EXCLUDED_ENTRIES) {
      const found = args.some((arg, i) => arg === "--glob" && args[i + 1] === `!${entry}`)
      expect(found, `expected --glob !${entry} in args`).toBe(true)
    }
  })

  it("includes --no-config to prevent user config interference", () => {
    const args = buildRgArgs(baseOptions)
    expect(args).toContain("--no-config")
  })

  it("ends with -- separator and . search path", () => {
    const args = buildRgArgs(baseOptions)
    const len = args.length
    expect(args[len - 2]).toBe("--")
    expect(args[len - 1]).toBe(".")
  })
})

// -- unit tests: parseRgJson --

describe("parseRgJson", () => {
  const defaultOptions: SearchOptions = {
    query: "hello",
    workspacePath: "/home/user/projects",
  }

  const makeNdjson = (messages: object[]): string =>
    messages.map((m) => JSON.stringify(m)).join("\n")

  it("parses complete ndjson output with 2 files, each having 2 matches", () => {
    const output = makeNdjson([
      { type: "begin", data: { path: { text: "./a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello world\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "say hello again\n" },
          line_number: 5,
          submatches: [{ match: { text: "hello" }, start: 4, end: 9 }],
        },
      },
      { type: "end", data: { path: { text: "./a.ts" }, stats: {} } },
      { type: "begin", data: { path: { text: "./b.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "./b.ts" },
          lines: { text: "hello there\n" },
          line_number: 3,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "./b.ts" },
          lines: { text: "  hello!\n" },
          line_number: 10,
          submatches: [{ match: { text: "hello" }, start: 2, end: 7 }],
        },
      },
      { type: "end", data: { path: { text: "./b.ts" }, stats: {} } },
      { type: "summary", data: { stats: { matched_lines: 4 } } },
    ])

    const { results, limitHit } = parseRgJson(output, defaultOptions)

    expect(limitHit).toBe(false)
    expect(results).toHaveLength(2)

    expect(results[0].file).toBe("/home/user/projects/a.ts")
    expect(results[0].matches).toHaveLength(2)
    expect(results[0].matches[0].lineNumber).toBe(1)
    expect(results[0].matches[0].lineContent).toBe("hello world")
    expect(results[0].matches[0].matchStart).toBe(0)
    expect(results[0].matches[0].matchEnd).toBe(5)
    expect(results[0].matches[1].lineNumber).toBe(5)

    expect(results[1].file).toBe("/home/user/projects/b.ts")
    expect(results[1].matches).toHaveLength(2)
    expect(results[1].matches[0].lineNumber).toBe(3)
    expect(results[1].matches[1].matchStart).toBe(2)
  })

  it("returns empty results for output with no matches", () => {
    const output = makeNdjson([{ type: "summary", data: { stats: { matched_lines: 0 } } }])

    const { results, limitHit } = parseRgJson(output, defaultOptions)

    expect(results).toHaveLength(0)
    expect(limitHit).toBe(false)
  })

  it("enforces maxFiles limit and sets limitHit", () => {
    const output = makeNdjson([
      { type: "begin", data: { path: { text: "./a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "./a.ts" }, stats: {} } },
      { type: "begin", data: { path: { text: "./b.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "./b.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "./b.ts" }, stats: {} } },
    ])

    const { results, limitHit } = parseRgJson(output, {
      ...defaultOptions,
      maxFiles: 1,
    })

    expect(results).toHaveLength(1)
    expect(results[0].file).toBe("/home/user/projects/a.ts")
    expect(limitHit).toBe(true)
  })

  it("enforces maxResults limit and sets limitHit", () => {
    const output = makeNdjson([
      { type: "begin", data: { path: { text: "./a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello one\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello two\n" },
          line_number: 2,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello three\n" },
          line_number: 3,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "./a.ts" }, stats: {} } },
    ])

    const { results, limitHit } = parseRgJson(output, {
      ...defaultOptions,
      maxResults: 2,
    })

    expect(results).toHaveLength(1)
    expect(results[0].matches).toHaveLength(2)
    expect(limitHit).toBe(true)
  })

  it("skips malformed json lines without crashing", () => {
    const output = [
      JSON.stringify({
        type: "begin",
        data: { path: { text: "./a.ts" } },
      }),
      "this is not valid json{{{",
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      }),
    ].join("\n")

    const { results } = parseRgJson(output, defaultOptions)

    expect(results).toHaveLength(1)
    expect(results[0].matches).toHaveLength(1)
  })

  it("ignores summary messages", () => {
    const output = makeNdjson([
      { type: "summary", data: { elapsed_total: { secs: 0, nanos: 123 }, stats: {} } },
    ])

    const { results, limitHit } = parseRgJson(output, defaultOptions)

    expect(results).toHaveLength(0)
    expect(limitHit).toBe(false)
  })
})

// -- unit tests: parseLine --

describe("parseLine", () => {
  const rootPath = "/home/user/projects"

  it("parses a begin message and creates file entry with resolved absolute path", () => {
    const state = createParseState(rootPath)
    const line = JSON.stringify({
      type: "begin",
      data: { path: { text: "./a.ts" } },
    })
    expect(parseLine(line, state, 100, 100)).toBe(true)
    expect(state.fileOrder).toEqual(["/home/user/projects/a.ts"])
  })

  it("parses a match message and increments totalMatches", () => {
    const state = createParseState(rootPath)
    parseLine(
      JSON.stringify({
        type: "begin",
        data: { path: { text: "./a.ts" } },
      }),
      state,
      100,
      100,
    )

    const result = parseLine(
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello world\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      }),
      state,
      100,
      100,
    )
    expect(result).toBe(true)
    expect(state.totalMatches).toBe(1)

    const finalized = finalizeParseState(state)
    expect(finalized.results[0].matches[0].lineContent).toBe("hello world")
    expect(finalized.results[0].matches[0].path).toBe("/home/user/projects/a.ts")
  })

  it("returns false when maxResults is reached", () => {
    const state = createParseState(rootPath)
    const absPath = "/home/user/projects/a.ts"
    state.resultsByFile.set(absPath, { file: absPath, matches: [] })
    state.fileOrder.push(absPath)
    state.totalMatches = 5

    const result = parseLine(
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "./a.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      }),
      state,
      5,
      100,
    )
    expect(result).toBe(false)
    expect(state.limitHit).toBe(true)
  })

  it("returns false when maxFiles is reached on begin", () => {
    const state = createParseState(rootPath)
    const absPath = "/home/user/projects/a.ts"
    state.resultsByFile.set(absPath, { file: absPath, matches: [] })
    state.fileOrder.push(absPath)

    const result = parseLine(
      JSON.stringify({
        type: "begin",
        data: { path: { text: "./b.ts" } },
      }),
      state,
      100,
      1,
    )
    expect(result).toBe(false)
    expect(state.limitHit).toBe(true)
  })

  it("skips malformed json without error", () => {
    const state = createParseState(rootPath)
    expect(parseLine("not json {{{", state, 100, 100)).toBe(true)
    expect(state.totalMatches).toBe(0)
  })

  it("skips empty and whitespace-only lines", () => {
    const state = createParseState(rootPath)
    expect(parseLine("", state, 100, 100)).toBe(true)
    expect(parseLine("  ", state, 100, 100)).toBe(true)
    expect(state.fileOrder).toHaveLength(0)
  })
})

// -- integration tests --
//
// runs real ripgrep against a temp directory with known files.
// verifies the full pipeline: args → spawn → parse → absolute paths.

const isRgAvailable = (): boolean => {
  try {
    const { rgPath: rg } = require("@vscode/ripgrep") as { rgPath: string }
    execFileSync(rg, ["--version"], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/** runs ripgrep synchronously and parses the results */
const runRgSync = (
  options: SearchOptions,
): { results: ReturnType<typeof parseRgJson>["results"]; limitHit: boolean } => {
  const args = buildRgArgs(options)
  const { rgPath: rg } = require("@vscode/ripgrep") as { rgPath: string }

  let stdout: string
  try {
    stdout = execFileSync(rg, args, {
      cwd: options.workspacePath,
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf-8",
      timeout: 10_000,
    })
  } catch (err: unknown) {
    const execError = err as { status?: number; stdout?: string }
    if (execError.status === 1) {
      stdout = ""
    } else {
      throw err
    }
  }

  return parseRgJson(stdout, options)
}

describe.skipIf(!isRgAvailable())("search (integration)", () => {
  // shared temp directory with a realistic nested structure:
  //   workspace/
  //     greeting.ts          — contains "hello world"
  //     farewell.ts          — contains "hello again"
  //     unrelated.ts         — no match
  //     src/
  //       components/
  //         button.tsx       — contains "hello"
  //       utils/
  //         helpers.ts       — contains "Hello" (uppercase)
  //     node_modules/
  //       dep/
  //         index.js         — contains "hello" (should be excluded)

  let workspacePath: string

  beforeAll(async () => {
    workspacePath = await mkdtemp(path.join(os.tmpdir(), "rg-integration-"))

    await mkdir(path.join(workspacePath, "src", "components"), { recursive: true })
    await mkdir(path.join(workspacePath, "src", "utils"), { recursive: true })
    await mkdir(path.join(workspacePath, "node_modules", "dep"), { recursive: true })

    await Promise.all([
      writeFile(
        path.join(workspacePath, "greeting.ts"),
        'const msg = "hello world"\nconsole.log(msg)\n',
      ),
      writeFile(
        path.join(workspacePath, "farewell.ts"),
        'const bye = "goodbye"\nconst hi = "hello again"\n',
      ),
      writeFile(
        path.join(workspacePath, "unrelated.ts"),
        'const x = 42\nconst y = "no match here"\n',
      ),
      writeFile(
        path.join(workspacePath, "src", "components", "button.tsx"),
        "export function Button() {\n  return <button>hello</button>\n}\n",
      ),
      writeFile(
        path.join(workspacePath, "src", "utils", "helpers.ts"),
        '// Hello uppercase\nexport const greet = () => "Hello"\n',
      ),
      writeFile(
        path.join(workspacePath, "node_modules", "dep", "index.js"),
        'module.exports = "hello from dep"\n',
      ),
    ])
  })

  afterAll(async () => {
    await rm(workspacePath, { recursive: true })
  })

  it("returns absolute paths for all results and matches", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    expect(results.length).toBeGreaterThanOrEqual(2)

    for (const result of results) {
      expect(result.file).toMatch(/^\//)
      expect(result.file).not.toContain("./")
      expect(result.file.startsWith(workspacePath)).toBe(true)

      for (const match of result.matches) {
        expect(match.path).toMatch(/^\//)
        expect(match.path).not.toContain("./")
        expect(match.path.startsWith(workspacePath)).toBe(true)
      }
    }
  })

  it("finds matches in root files", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    const greetingResult = results.find((r) => r.file === path.join(workspacePath, "greeting.ts"))
    expect(greetingResult).toBeDefined()
    expect(greetingResult!.matches).toHaveLength(1)
    expect(greetingResult!.matches[0].lineNumber).toBe(1)
    expect(greetingResult!.matches[0].lineContent).toContain("hello world")
  })

  it("finds matches in nested directories", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    const buttonResult = results.find(
      (r) => r.file === path.join(workspacePath, "src", "components", "button.tsx"),
    )
    expect(buttonResult).toBeDefined()
    expect(buttonResult!.matches).toHaveLength(1)
    expect(buttonResult!.matches[0].lineNumber).toBe(2)
  })

  it("does not include files without matches", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    const matchedFiles = results.map((r) => r.file)
    expect(matchedFiles).not.toContain(path.join(workspacePath, "unrelated.ts"))
  })

  it("respects case sensitivity", () => {
    const caseSensitive = runRgSync({ query: "Hello", workspacePath, caseSensitive: true })
    const caseInsensitive = runRgSync({ query: "Hello", workspacePath, caseSensitive: false })

    // case-sensitive should only find the uppercase "Hello" in helpers.ts
    const sensitiveFiles = caseSensitive.results.map((r) => path.basename(r.file))
    expect(sensitiveFiles).toContain("helpers.ts")
    expect(sensitiveFiles).not.toContain("greeting.ts")

    // case-insensitive should find matches across many files
    expect(caseInsensitive.results.length).toBeGreaterThan(caseSensitive.results.length)
  })

  it("respects includeGlob filter", () => {
    const { results } = runRgSync({ query: "hello", workspacePath, includeGlob: "*.tsx" })

    const matchedFiles = results.map((r) => path.basename(r.file))
    expect(matchedFiles).toContain("button.tsx")
    expect(matchedFiles).not.toContain("greeting.ts")
    expect(matchedFiles).not.toContain("farewell.ts")
  })

  it("respects excludeGlob filter", () => {
    const { results } = runRgSync({ query: "hello", workspacePath, excludeGlob: "*.tsx" })

    const matchedFiles = results.map((r) => path.basename(r.file))
    expect(matchedFiles).not.toContain("button.tsx")
    expect(matchedFiles).toContain("greeting.ts")
  })

  it("returns no results for a query with no matches", () => {
    const { results, limitHit } = runRgSync({ query: "zzz_no_match_zzz", workspacePath })

    expect(results).toHaveLength(0)
    expect(limitHit).toBe(false)
  })

  it("enforces maxResults limit", () => {
    const { results, limitHit } = runRgSync({ query: "hello", workspacePath, maxResults: 1 })

    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0)
    expect(totalMatches).toBe(1)
    expect(limitHit).toBe(true)
  })

  it("populates match offsets correctly", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    const greetingResult = results.find((r) => r.file === path.join(workspacePath, "greeting.ts"))
    expect(greetingResult).toBeDefined()

    const match = greetingResult!.matches[0]
    const highlighted = match.lineContent.slice(match.matchStart, match.matchEnd)
    expect(highlighted).toBe("hello")
  })

  it("match.path equals result.file for every match", () => {
    const { results } = runRgSync({ query: "hello", workspacePath })

    for (const result of results) {
      for (const match of result.matches) {
        expect(match.path).toBe(result.file)
      }
    }
  })
})
