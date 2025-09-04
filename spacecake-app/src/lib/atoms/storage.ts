import { Schema } from "effect"
import { atom } from "jotai"

import type { RecentFile, RecentFiles } from "@/types/storage"
import { RecentFilesSchema } from "@/types/storage"
import type { File } from "@/types/workspace"

// Helper function to get localStorage key for a workspace's recent files
function getWorkspaceRecentFilesKey(workspacePath: string): string {
  // Create a safe key from the workspace path
  const safePath = workspacePath.replace(/[^a-zA-Z0-9]/g, "_")
  return `spacecake:recent-files:${safePath}`
}

// Atom for current workspace's recent files (loaded on demand)
export const workspaceRecentFilesAtom = atom<RecentFiles>([])

// Utility function to add a recent file for a specific workspace
export const addRecentFileAtom = atom(
  null,
  (get, set, file: File, workspacePath: string) => {
    const now = Date.now()

    // Create recent file entry
    const recentFile: RecentFile = {
      path: file.path,
      name: file.name,
      fileType: file.fileType,
      lastAccessed: now,
      workspacePath,
    }

    // Get current workspace files from localStorage
    const storageKey = getWorkspaceRecentFilesKey(workspacePath)
    const currentFiles = get(workspaceRecentFilesAtom)

    // Remove existing entry for this file if it exists
    const filteredFiles = currentFiles.filter(
      (f: RecentFile) => f.path !== file.path
    )

    // Add new entry at the beginning and limit to 10 files
    const updatedFiles = [recentFile, ...filteredFiles].slice(0, 10)

    // Update localStorage for this workspace with proper schema encoding
    const encoded = Schema.encodeSync(RecentFilesSchema)(updatedFiles)
    localStorage.setItem(storageKey, JSON.stringify(encoded))

    // Update the current workspace atom
    set(workspaceRecentFilesAtom, updatedFiles)
  }
)

// Atom to load recent files for a specific workspace
export const readRecentFilesForWorkspaceAtom = atom(
  null,
  (get, set, workspacePath: string) => {
    const storageKey = getWorkspaceRecentFilesKey(workspacePath)
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const result = Schema.decodeUnknownSync(RecentFilesSchema)(parsed)
        set(workspaceRecentFilesAtom, result)
      } catch {
        // If parsing or validation fails, start with empty array
        set(workspaceRecentFilesAtom, [])
      }
    } else {
      set(workspaceRecentFilesAtom, [])
    }
  }
)
