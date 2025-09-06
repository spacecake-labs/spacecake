import { Schema } from "effect"
import { atom } from "jotai"

import { EditorLayoutSchema, type EditorLayout } from "@/types/editor"
import {
  RecentFilesSchema,
  type RecentFile,
  type RecentFiles,
} from "@/types/storage"
import type { File } from "@/types/workspace"

function workspaceId(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, "_")
}

// Helper function to get localStorage key for a workspace's recent files
export function getWorkspaceRecentFilesKey(workspacePath: string): string {
  return `spacecake:recent-files:${workspaceId(workspacePath)}`
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
export const initRecentFilesAtom = atom(
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

export const removeRecentFileAtom = atom(
  null,
  (get, set, filePath: string, workspacePath: string) => {
    const storageKey = getWorkspaceRecentFilesKey(workspacePath)
    const currentFiles = get(workspaceRecentFilesAtom)

    const updatedFiles = currentFiles.filter(
      (f: RecentFile) => f.path !== filePath
    )

    if (updatedFiles.length < currentFiles.length) {
      const encoded = Schema.encodeSync(RecentFilesSchema)(updatedFiles)
      localStorage.setItem(storageKey, JSON.stringify(encoded))
      set(workspaceRecentFilesAtom, updatedFiles)
    }
  }
)

export function getWorkspaceEditorLayoutKey(workspacePath: string): string {
  return `spacecake:editor-layout:${workspaceId(workspacePath)}`
}

export const editorLayoutAtom = atom<EditorLayout | null>(null)

export const saveEditorLayoutAtom = atom(
  null,
  (get, set, layout: EditorLayout, workspacePath: string) => {
    const storageKey = getWorkspaceEditorLayoutKey(workspacePath)
    const encoded = Schema.encodeSync(EditorLayoutSchema)(layout)
    localStorage.setItem(storageKey, JSON.stringify(encoded))
    set(editorLayoutAtom, layout)
  }
)

export const readEditorLayoutAtom = atom(
  null,
  (get, set, workspacePath: string) => {
    const storageKey = getWorkspaceEditorLayoutKey(workspacePath)
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const result = Schema.decodeUnknownSync(EditorLayoutSchema)(parsed)
        set(editorLayoutAtom, result)
      } catch {
        set(editorLayoutAtom, null)
      }
    } else {
      set(editorLayoutAtom, null)
    }
  }
)

// Atom to open a file and properly manage tabs
export const openFileAtom = atom(
  null,
  (get, set, filePath: string, workspacePath: string) => {
    const currentLayout = get(editorLayoutAtom)

    if (!currentLayout) {
      // create new layout with this file
      const newLayout: EditorLayout = {
        tabGroups: [
          {
            id: "main",
            tabs: [
              {
                id: filePath,
                filePath: filePath,
              },
            ],
            activeTabId: filePath,
          },
        ],
        activeTabGroupId: "main",
      }
      set(saveEditorLayoutAtom, newLayout, workspacePath)
      return
    }

    // check if file is already open in any tab group
    let existingTab = null
    let existingGroup = null

    for (const group of currentLayout.tabGroups) {
      const tab = group.tabs.find((t) => t.filePath === filePath)
      if (tab) {
        existingTab = tab
        existingGroup = group
        break
      }
    }

    if (existingTab && existingGroup) {
      // file is already open, just switch to it
      const updatedLayout = {
        ...currentLayout,
        activeTabGroupId: existingGroup.id,
        tabGroups: currentLayout.tabGroups.map((group) =>
          group.id === existingGroup.id
            ? { ...group, activeTabId: existingTab.id }
            : group
        ),
      }
      set(saveEditorLayoutAtom, updatedLayout, workspacePath)
    } else {
      // add new tab to the active group
      const activeGroup = currentLayout.tabGroups.find(
        (g) => g.id === currentLayout.activeTabGroupId
      )

      if (activeGroup) {
        const newTab = {
          id: filePath,
          filePath: filePath,
        }

        const updatedLayout = {
          ...currentLayout,
          tabGroups: currentLayout.tabGroups.map((group) =>
            group.id === activeGroup.id
              ? {
                  ...group,
                  tabs: [...group.tabs, newTab],
                  activeTabId: newTab.id,
                }
              : group
          ),
        }
        set(saveEditorLayoutAtom, updatedLayout, workspacePath)
      } else {
        // no active group, create a new one
        const newLayout: EditorLayout = {
          tabGroups: [
            {
              id: "main",
              tabs: [
                {
                  id: filePath,
                  filePath: filePath,
                },
              ],
              activeTabId: filePath,
            },
          ],
          activeTabGroupId: "main",
        }
        set(saveEditorLayoutAtom, newLayout, workspacePath)
      }
    }
  }
)
