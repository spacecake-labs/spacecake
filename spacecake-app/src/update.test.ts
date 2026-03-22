import { mkdtemp, writeFile, readFile, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it, expect, beforeEach } from "vitest"

import { safeSwapFiles } from "@/update"

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false)
}

describe("safeSwapFiles", () => {
  let dir: string
  let currentPath: string
  let newPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "updater-test-"))
    currentPath = join(dir, "app")
    newPath = join(dir, "app.download")
  })

  it("replaces the current file with the new file", async () => {
    await writeFile(currentPath, "old version")
    await writeFile(newPath, "new version")

    await safeSwapFiles(currentPath, newPath)

    expect(await readFile(currentPath, "utf-8")).toBe("new version")
  })

  it("removes the downloaded file after swap", async () => {
    await writeFile(currentPath, "old version")
    await writeFile(newPath, "new version")

    await safeSwapFiles(currentPath, newPath)

    expect(await exists(newPath)).toBe(false)
  })

  it("cleans up the backup file", async () => {
    await writeFile(currentPath, "old version")
    await writeFile(newPath, "new version")

    await safeSwapFiles(currentPath, newPath)

    expect(await exists(`${currentPath}.backup`)).toBe(false)
  })

  it("preserves the old file as .backup if the second rename fails", async () => {
    await writeFile(currentPath, "old version")
    // no new file exists — the second rename will fail

    await expect(safeSwapFiles(currentPath, newPath)).rejects.toThrow()

    // the old version is safe as .backup
    expect(await readFile(`${currentPath}.backup`, "utf-8")).toBe("old version")
  })
})
