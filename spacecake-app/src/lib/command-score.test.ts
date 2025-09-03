import { describe, expect, it } from "vitest"

import { commandScore } from "@/lib/command-score"

describe("commandScore", () => {
  it("should give perfect command score for exact match", () => {
    const score = commandScore("hello", "hello", [])
    expect(score).toBe(1)
  })

  it("should give high command score for word boundary matches", () => {
    const score = commandScore("new file", "nf", [])
    expect(score).toBeGreaterThan(0.8)
  })

  it("should give lower command score for character jumps", () => {
    const score = commandScore("hello", "hl", [])
    expect(score).toBeLessThan(0.5)
  })

  it("command scoreshould handle case insensitive matching", () => {
    const score1 = commandScore("Hello", "hello", [])
    const score2 = commandScore("hello", "Hello", [])
    expect(score1).toBeGreaterThan(0)
    expect(score2).toBeGreaterThan(0)
  })

  it("command score should include aliases in scoring", () => {
    const scoreWithAliases = commandScore("new file", "create file", [
      "new",
      "create",
      "add",
      "file",
    ])
    const scoreWithoutAliases = commandScore("new file", "create file", [])
    expect(scoreWithAliases).toBeGreaterThan(scoreWithoutAliases)
  })

  it("command score should include unix-style aliases in scoring", () => {
    const scoreWithAliases = commandScore("delete file", "rm", [
      "remove",
      "file",
    ])
    const scoreWithoutAliases = commandScore("delete file", "rm", [])
    expect(scoreWithAliases).toBeGreaterThan(scoreWithoutAliases)
  })

  it("command score should return 0 for no match", () => {
    const score = commandScore("hello", "xyz", [])
    expect(score).toBe(0)
  })

  it("command score should handle empty strings", () => {
    const score = commandScore("", "", [])
    expect(score).toBe(1)
  })

  describe("file search scenarios", () => {
    it("should rank component files correctly by name", () => {
      const files = [
        "src/components/Button.tsx",
        "src/components/Modal.tsx",
        "src/components/Input.tsx",
        "src/utils/helpers.ts",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "btn", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // Button.tsx should rank highest for "btn"
      expect(scores[0].file).toBe("src/components/Button.tsx")
    })

    it("should rank files by extension correctly", () => {
      const files = [
        "src/utils/helpers.ts",
        "src/components/Button.tsx",
        "src/styles/globals.css",
        "src/README.md",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "ts", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // .ts files should rank highest
      expect(scores[0].file).toBe("src/utils/helpers.ts")
      expect(scores[1].file).toBe("src/components/Button.tsx")
    })

    it("should rank files by directory correctly", () => {
      const files = [
        "src/components/ui/Modal.tsx",
        "src/components/Button.tsx",
        "src/utils/ui-helpers.ts",
        "src/lib/workspace.ts",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "ui", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // Files with "ui" in path should rank highest
      expect(scores[0].file).toBe("src/components/ui/Modal.tsx")
      expect(scores[1].file).toBe("src/utils/ui-helpers.ts")
    })

    it("should rank word boundaries higher than character jumps", () => {
      const files = [
        "src/components/Button.tsx",
        "src/components/BottomNavigation.tsx",
        "src/components/BaseButton.tsx",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "btn", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // "Button" should rank higher than "Bottom" or "Base" for "btn"
      expect(scores[0].file).toBe("src/components/Button.tsx")
    })

    it("should rank files with aliases higher", () => {
      const files = [
        { path: "src/components/Button.tsx", aliases: ["button", "ui"] },
        { path: "src/components/Modal.tsx", aliases: [] },
        { path: "src/components/Input.tsx", aliases: [] },
      ]

      const scores = files.map((file) => ({
        file: file.path,
        score: commandScore(file.path, "btn", file.aliases),
      }))

      scores.sort((a, b) => b.score - a.score)

      // Button with aliases should rank highest
      expect(scores[0].file).toBe("src/components/Button.tsx")
    })

    it("should handle full filepaths correctly", () => {
      const files = [
        "/Users/alexandermoores/Documents/GitHub/code-alexander/spacecake/spacecake-app/src/components/Button.tsx",
        "/Users/alexandermoores/Documents/GitHub/code-alexander/spacecake/spacecake-app/src/components/Modal.tsx",
        "/Users/alexandermoores/Documents/GitHub/code-alexander/spacecake/spacecake-app/src/utils/helpers.ts",
        "/Users/alexandermoores/Documents/GitHub/code-alexander/spacecake/spacecake-app/package.json",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "btn", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // Button.tsx should still rank highest even with full path
      expect(scores[0].file).toContain("Button.tsx")
    })

    it("should rank test files correctly", () => {
      const files = [
        "src/components/Button.test.tsx",
        "src/components/Button.tsx",
        "src/components/Button.stories.tsx",
        "src/utils/helpers.ts",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "test", []),
      }))

      scores.sort((a, b) => b.score - a.score)

      // Test files should rank highest
      expect(scores[0].file).toBe("src/components/Button.test.tsx")
    })

    it("should return 0 for completely unrelated files", () => {
      const files = [
        "src/components/Button.tsx",
        "src/utils/helpers.ts",
        "src/styles/globals.css",
      ]

      const scores = files.map((file) => ({
        file,
        score: commandScore(file, "xyz", []),
      }))

      // All should be 0 for unrelated search
      scores.forEach(({ score }) => {
        expect(score).toBe(0)
      })
    })
  })
})
