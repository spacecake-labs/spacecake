import { execFileSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { EXCLUDED_ENTRIES } from "@/lib/ignore-patterns"
import { buildRgArgs, parseRgJson, type SearchOptions } from "@/services/ripgrep-search"

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
      { type: "begin", data: { path: { text: "/home/user/projects/a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "hello world\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "say hello again\n" },
          line_number: 5,
          submatches: [{ match: { text: "hello" }, start: 4, end: 9 }],
        },
      },
      { type: "end", data: { path: { text: "/home/user/projects/a.ts" }, stats: {} } },
      { type: "begin", data: { path: { text: "/home/user/projects/b.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/b.ts" },
          lines: { text: "hello there\n" },
          line_number: 3,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/b.ts" },
          lines: { text: "  hello!\n" },
          line_number: 10,
          submatches: [{ match: { text: "hello" }, start: 2, end: 7 }],
        },
      },
      { type: "end", data: { path: { text: "/home/user/projects/b.ts" }, stats: {} } },
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
      { type: "begin", data: { path: { text: "/home/user/projects/a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "/home/user/projects/a.ts" }, stats: {} } },
      { type: "begin", data: { path: { text: "/home/user/projects/b.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/b.ts" },
          lines: { text: "hello\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "/home/user/projects/b.ts" }, stats: {} } },
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
      { type: "begin", data: { path: { text: "/home/user/projects/a.ts" } } },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "hello one\n" },
          line_number: 1,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "hello two\n" },
          line_number: 2,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      {
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
          lines: { text: "hello three\n" },
          line_number: 3,
          submatches: [{ match: { text: "hello" }, start: 0, end: 5 }],
        },
      },
      { type: "end", data: { path: { text: "/home/user/projects/a.ts" }, stats: {} } },
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
        data: { path: { text: "/home/user/projects/a.ts" } },
      }),
      "this is not valid json{{{",
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "/home/user/projects/a.ts" },
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

// -- integration test --

const isRgAvailable = (): boolean => {
  try {
    const { rgPath: rg } = require("@vscode/ripgrep") as { rgPath: string }
    execFileSync(rg, ["--version"], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

describe("search (integration)", () => {
  it.skipIf(!isRgAvailable())(
    "finds matches in temp directory with known content",
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-search-test-"))

      try {
        // create test files
        await writeFile(
          path.join(tmpDir, "greeting.ts"),
          'const msg = "hello world"\nconsole.log(msg)\n',
        )
        await writeFile(
          path.join(tmpDir, "farewell.ts"),
          'const bye = "goodbye"\nconst hi = "hello again"\n',
        )
        await writeFile(
          path.join(tmpDir, "unrelated.ts"),
          'const x = 42\nconst y = "no match here"\n',
        )

        const options: SearchOptions = {
          query: "hello",
          workspacePath: tmpDir,
        }
        const args = buildRgArgs(options)
        // append the search path as a positional argument for the integration test
        // (in production, the search function uses cwd instead)
        args.push(tmpDir)
        const { rgPath: rg } = require("@vscode/ripgrep") as { rgPath: string }

        // use execFileSync to avoid event loop issues in vitest worker threads
        let stdout: string
        try {
          stdout = execFileSync(rg, args, {
            maxBuffer: 50 * 1024 * 1024,
            encoding: "utf-8",
            timeout: 10_000,
          })
        } catch (err: unknown) {
          // exit code 1 means no matches (not an error)
          const execError = err as { status?: number; stdout?: string }
          if (execError.status === 1) {
            stdout = ""
          } else {
            throw err
          }
        }

        const result = parseRgJson(stdout, options)

        expect(result.limitHit).toBe(false)
        expect(result.results.length).toBeGreaterThanOrEqual(2)

        // collect all matched file basenames
        const matchedFiles = result.results.map((r) => path.basename(r.file)).sort()
        expect(matchedFiles).toContain("greeting.ts")
        expect(matchedFiles).toContain("farewell.ts")
        expect(matchedFiles).not.toContain("unrelated.ts")

        // verify match content
        const greetingResult = result.results.find((r) => r.file.endsWith("greeting.ts"))!
        expect(greetingResult.matches.length).toBeGreaterThanOrEqual(1)
        expect(greetingResult.matches[0].lineContent).toContain("hello")
        expect(greetingResult.matches[0].lineNumber).toBe(1)
      } finally {
        await rm(tmpDir, { recursive: true })
      }
    },
    15_000,
  )
})
