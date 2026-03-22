import { describe, expect, it } from "vitest"

import { isUncommitted, parseBlameOutput } from "@/services/git-blame-parser"

describe("parseBlameOutput", () => {
  it("parses a single-line file blame", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary fix parser",
      "filename src/index.ts",
      "\tconst result = parse(input)",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result).toHaveLength(1)
    expect(result[0].hash).toBe("abcd1234abcd1234abcd1234abcd1234abcd1234")
    expect(result[0].author).toBe("user")
    expect(result[0].summary).toBe("fix parser")
    expect(result[0].line).toBe(1)
  })

  it("parses a multi-line file with multiple commits", () => {
    const raw = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1",
      "author user-a",
      "author-mail <a@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user-a",
      "committer-mail <a@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary first commit",
      "filename src/index.ts",
      "\tline one",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2 2 1",
      "author user-b",
      "author-mail <b@host>",
      "author-time 1700100000",
      "author-tz +0000",
      "committer user-b",
      "committer-mail <b@host>",
      "committer-time 1700100000",
      "committer-tz +0000",
      "summary second commit",
      "filename src/index.ts",
      "\tline two",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result).toHaveLength(2)
    expect(result[0].author).toBe("user-a")
    expect(result[0].summary).toBe("first commit")
    expect(result[0].line).toBe(1)
    expect(result[1].author).toBe("user-b")
    expect(result[1].summary).toBe("second commit")
    expect(result[1].line).toBe(2)
  })

  it("handles uncommitted lines (hash all zeros)", () => {
    const raw = [
      "0000000000000000000000000000000000000000 1 1 1",
      "author not committed yet",
      "author-mail <not.committed.yet>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer not committed yet",
      "committer-mail <not.committed.yet>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary not yet committed",
      "filename src/index.ts",
      "\tuncommitted line",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result).toHaveLength(1)
    expect(isUncommitted(result[0].hash)).toBe(true)
  })

  it("handles empty output (new file with no commits)", () => {
    expect(parseBlameOutput("")).toEqual([])
    expect(parseBlameOutput("  \n  ")).toEqual([])
  })

  it("parses author-time as unix timestamp to Date", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary test",
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].date).toEqual(new Date(1700000000 * 1000))
  })

  it("handles multi-word author names", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author some user with spaces",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer some user with spaces",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary test",
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].author).toBe("some user with spaces")
  })

  it("handles summary with special characters", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      'summary fix: handle "quotes" & <brackets> (parens)',
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].summary).toBe('fix: handle "quotes" & <brackets> (parens)')
  })

  it("handles repeated hash lines (same commit, group continuation)", () => {
    // when a commit covers multiple lines, only the first line has full headers
    // subsequent lines in the group have just the hash line + content
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 2",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary fix parser",
      "filename src/index.ts",
      "\tline one",
      "abcd1234abcd1234abcd1234abcd1234abcd1234 2 2",
      "\tline two",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result).toHaveLength(2)
    expect(result[0].line).toBe(1)
    expect(result[0].author).toBe("user")
    expect(result[0].summary).toBe("fix parser")
    expect(result[1].line).toBe(2)
    // second entry inherits author/summary from the commit cache
    expect(result[1].author).toBe("user")
    expect(result[1].summary).toBe("fix parser")
    expect(result[1].hash).toBe("abcd1234abcd1234abcd1234abcd1234abcd1234")
  })

  it("parses author-tz field", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz -0500",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz -0500",
      "summary test",
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].authorTz).toBe("-0500")
  })

  it("parses previous field", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary test",
      "previous 1111111111111111111111111111111111111111 src/old.ts",
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].previous).toEqual({
      hash: "1111111111111111111111111111111111111111",
      filename: "src/old.ts",
    })
  })

  it("parses filename field", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary test",
      "filename src/index.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result[0].filename).toBe("src/index.ts")
  })

  it("propagates all cached fields to continuation lines", () => {
    const raw = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 3",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz -0700",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz -0700",
      "summary multi-line commit",
      "previous 1111111111111111111111111111111111111111 src/old.ts",
      "filename src/index.ts",
      "\tline one",
      "abcd1234abcd1234abcd1234abcd1234abcd1234 2 2",
      "\tline two",
      "abcd1234abcd1234abcd1234abcd1234abcd1234 3 3",
      "\tline three",
    ].join("\n")

    const result = parseBlameOutput(raw)
    expect(result).toHaveLength(3)

    for (const line of result) {
      expect(line.author).toBe("user")
      expect(line.summary).toBe("multi-line commit")
      expect(line.authorTz).toBe("-0700")
      expect(line.filename).toBe("src/index.ts")
      expect(line.previous).toEqual({
        hash: "1111111111111111111111111111111111111111",
        filename: "src/old.ts",
      })
    }
  })
})

describe("isUncommitted", () => {
  it("returns true for all-zero hash", () => {
    expect(isUncommitted("0000000000000000000000000000000000000000")).toBe(true)
  })

  it("returns false for non-zero hash", () => {
    expect(isUncommitted("abcd1234abcd1234abcd1234abcd1234abcd1234")).toBe(false)
  })
})
