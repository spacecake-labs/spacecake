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
    writeFileAtomicMock.mockResolvedValue(undefined)
    const { saveFileAtomic } = await import("@/main-process/fs")

    const filePath = "/tmp/example.py"
    const content = "print('hello')\n"

    await expect(saveFileAtomic(filePath, content)).resolves.toBeUndefined()
    expect(writeFileAtomicMock).toHaveBeenCalledWith(filePath, content, {
      encoding: "utf8",
    })
  })

  it("propagates errors from underlying writer", async () => {
    writeFileAtomicMock.mockRejectedValue(new Error("write failed"))
    const { saveFileAtomic } = await import("@/main-process/fs")

    await expect(saveFileAtomic("/tmp/fail.py", "")).rejects.toThrow(
      "write failed"
    )
  })
})
