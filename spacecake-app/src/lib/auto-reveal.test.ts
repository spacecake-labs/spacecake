import { describe, expect, it } from "vitest"

import { AbsolutePath } from "@/types/workspace"
import { getFoldersToExpand, mergeExpandedFolders } from "@/lib/auto-reveal"

describe("auto-reveal", () => {
  describe("getFoldersToExpand", () => {
    it("should return empty array for file in workspace root", () => {
      const workspacePath = AbsolutePath("/workspace")
      const filePath = AbsolutePath("/workspace/file.txt")

      const result = getFoldersToExpand(filePath, workspacePath)

      expect(result).toEqual([])
    })

    it("should return single folder for file in one level deep", () => {
      const workspacePath = AbsolutePath("/workspace")
      const filePath = AbsolutePath("/workspace/src/file.txt")

      const result = getFoldersToExpand(filePath, workspacePath)

      expect(result).toEqual(["/workspace/src"])
    })

    it("should return multiple folders for deeply nested file", () => {
      const workspacePath = AbsolutePath("/workspace")
      const filePath = AbsolutePath("/workspace/src/components/ui/button.tsx")

      const result = getFoldersToExpand(filePath, workspacePath)

      expect(result).toEqual([
        "/workspace/src",
        "/workspace/src/components",
        "/workspace/src/components/ui",
      ])
    })
  })

  describe("mergeExpandedFolders", () => {
    it("should preserve user preferences and add auto-reveal folders", () => {
      const userExpandedFolders = {
        "/workspace/src": true,
        "/workspace/docs": false,
      }
      const foldersToAutoReveal = [
        "/workspace/src/components",
        "/workspace/src/components/ui",
      ]

      const result = mergeExpandedFolders(
        userExpandedFolders,
        foldersToAutoReveal
      )

      expect(result).toEqual({
        "/workspace/src": true,
        "/workspace/docs": false,
        "/workspace/src/components": true,
        "/workspace/src/components/ui": true,
      })
    })

    it("should respect user-collapsed folders and not override them with auto-reveal", () => {
      const userExpandedFolders = {
        "/workspace/src": false,
      }
      const foldersToAutoReveal = ["/workspace/src"]

      const result = mergeExpandedFolders(
        userExpandedFolders,
        foldersToAutoReveal
      )

      expect(result).toEqual({
        "/workspace/src": false,
      })
    })

    it("should handle empty inputs", () => {
      const result = mergeExpandedFolders({}, [])

      expect(result).toEqual({})
    })
  })
})
