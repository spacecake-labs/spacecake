import * as fs from "@/main-process/fs"
import { FileSystem } from "@effect/platform"
import { Effect, Either } from "effect"
import { describe, expect, test, vi } from "vitest"

describe("createFile", () => {
  test("calls fs.writeFile with correct arguments", async () => {
    const filePath = "/test/file.txt"
    const content = "hello world"
    const mockWriteFile = vi.fn(() => Effect.succeed(undefined))

    const program = fs.createFile(filePath, content)

    const mockLayer = FileSystem.layerNoop({
      writeFile: mockWriteFile,
    })

    await Effect.runPromise(Effect.provide(program, mockLayer))

    expect(mockWriteFile).toHaveBeenCalledWith(
      filePath,
      new TextEncoder().encode(content)
    )
  })
})

describe("renameFile", () => {
  test("throws error when new path already exists", async () => {
    const oldPath = "/old/file.txt"
    const newPath = "/existing/file.txt"

    const program = fs.renameFile(oldPath, newPath)

    const mockLayer = FileSystem.layerNoop({
      exists: (path) => Effect.succeed(path === newPath),
    })

    const result = await Effect.runPromise(
      Effect.provide(Effect.either(program), mockLayer)
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left.message).toContain(
        "error renaming file from /old/file.txt to /existing/file.txt"
      )
    }
  })
})
