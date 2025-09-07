import { Schema } from "effect"
import { atom } from "jotai"

import { EditorLayoutSchema, type EditorLayout } from "@/types/editor"
import { RecentFilesSchema, type RecentFile } from "@/types/storage"
import type { File } from "@/types/workspace"

function workspaceId(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, "_")
}

// Helper function to get localStorage key for a workspace's recent files
export function getWorkspaceRecentFilesKey(workspacePath: string): string {
  return `spacecake:recent-files:${workspaceId(workspacePath)}`
}

// private atom to hold the actual state of recent files
const recentFilesStateAtom = atom<RecentFile[]>([])

// publicly exported read-only atom for components to use
export const workspaceRecentFilesAtom = atom((get) => get(recentFilesStateAtom))

// single, centralized atom for all mutations
export const manageRecentFilesAtom = atom(
  null, // this is a write-only atom
  (
    get,
    set,
    action:
      | { type: "init"; workspacePath: string }
      | { type: "add"; file: File; workspacePath: string }
      | { type: "remove"; filePath: string; workspacePath: string }
  ) => {
    const { workspacePath } = action
    const storageKey = getWorkspaceRecentFilesKey(workspacePath)

    // always read the latest from storage to prevent race conditions
    const currentFiles = loadRecentFilesSync(workspacePath)
    let updatedFiles: RecentFile[]

    switch (action.type) {
      case "init":
        updatedFiles = currentFiles
        break

      case "add": {
        const { file } = action
        if (!file.path.startsWith(workspacePath)) {
          console.warn("attempted to add file from another workspace")
          return
        }

        const recentFile: RecentFile = {
          path: file.path,
          name: file.name,
          fileType: file.fileType,
          lastAccessed: Date.now(),
          workspacePath,
        }

        const filteredFiles = currentFiles.filter((f) => f.path !== file.path)
        updatedFiles = [recentFile, ...filteredFiles].slice(0, 10)
        break
      }

      case "remove": {
        updatedFiles = currentFiles.filter((f) => f.path !== action.filePath)
        break
      }
    }

    // write the new state back to localStorage
    const encoded = Schema.encodeSync(RecentFilesSchema)(updatedFiles)
    localStorage.setItem(storageKey, JSON.stringify(encoded))

    // finally, update the in-memory atom state
    set(recentFilesStateAtom, updatedFiles)
  }
)

export function getWorkspaceEditorLayoutKey(workspacePath: string): string {
  return `spacecake:editor-layout:${workspaceId(workspacePath)}`
}

// Synchronous data loading functions for use in route loaders
export function loadRecentFilesSync(workspacePath: string): RecentFile[] {
  const storageKey = getWorkspaceRecentFilesKey(workspacePath)
  const stored = localStorage.getItem(storageKey)

  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const result = Schema.decodeUnknownSync(RecentFilesSchema)(parsed)
      return [...result] // Convert readonly array to mutable array
    } catch {
      return []
    }
  }
  return []
}

export function loadEditorLayoutSync(
  workspacePath: string
): EditorLayout | null {
  const storageKey = getWorkspaceEditorLayoutKey(workspacePath)
  const stored = localStorage.getItem(storageKey)

  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const result = Schema.decodeUnknownSync(EditorLayoutSchema)(parsed)
      return result
    } catch {
      return null
    }
  }
  return null
}

export const saveEditorLayoutAtom = atom(
  null,
  (get, set, layout: EditorLayout, workspacePath: string) => {
    const storageKey = getWorkspaceEditorLayoutKey(workspacePath)
    const encoded = Schema.encodeSync(EditorLayoutSchema)(layout)
    localStorage.setItem(storageKey, JSON.stringify(encoded))
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
        // Layout is read but not stored in atom state since editorLayoutAtom was removed
        return result
      } catch {
        return null
      }
    } else {
      return null
    }
  }
)

// Atom to open a file and properly manage tabs
export const openFileAtom = atom(
  null,
  (get, set, filePath: string, workspacePath: string) => {
    const currentLayout = loadEditorLayoutSync(workspacePath)

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
