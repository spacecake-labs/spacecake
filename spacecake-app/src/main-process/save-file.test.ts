import { Effect, Either } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

// mock write-file-atomic before importing the module under test
const writeFileAtomicMock = vi.fn()
vi.mock("write-file-atomic", () => ({
  default: writeFileAtomicMock,
}))

describe("saveFileAtomic", () => {
  beforeEach(() => {
    writeFileAtomicMock.mockReset()
  })

  it("writes file atomically with utf8 encoding", async () => {
    const { FsLive, saveFileAtomic } = await import("@/main-process/fs")
    writeFileAtomicMock.mockResolvedValue(undefined)

    const filePath = "/tmp/example.py"
    const content = "print('hello')\n"

    const program = saveFileAtomic(filePath, content)
    const result = await Effect.runPromise(
      Effect.provide(Effect.either(program), FsLive)
    )

    expect(Either.isRight(result)).toBe(true)
    expect(writeFileAtomicMock).toHaveBeenCalledWith(filePath, content, {
      encoding: "utf8",
    })
  })

  it("propagates errors from underlying writer", async () => {
    const { FsLive, saveFileAtomic } = await import("@/main-process/fs")
    writeFileAtomicMock.mockRejectedValue(new Error("write failed"))

    const program = saveFileAtomic("/tmp/fail.py", "")
    const result = await Effect.runPromise(
      Effect.provide(Effect.either(program), FsLive)
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left.message).toContain("error saving file atomically")
      // Check the original error if needed
      expect((result.left.error as Error).message).toBe("write failed")
    }
  })
})
