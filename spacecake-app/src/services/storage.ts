import { Option, Schema } from "effect"

import { EditorLayoutSchema, type EditorLayout } from "@/types/editor"
import { AbsolutePath, WorkspaceInfo } from "@/types/workspace"

export interface StorageService {
  get(key: string): string | null
  set(key: string, value: string): void
}

export const localStorageService: StorageService = {
  get(key: string): string | null {
    // Check if localStorage is available to avoid errors in environments like Node.js
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key)
    }
    return null
  },

  set(key: string, value: string): void {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value)
    }
  },
}

export function workspaceId(workspacePath: WorkspaceInfo["path"]): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, "_")
}

export function workspaceEditorLayoutKey(
  workspacePath: WorkspaceInfo["path"]
): string {
  return `spacecake:editor-layout:${workspaceId(workspacePath)}`
}

export function editorLayoutFromStorage(
  storage: StorageService,
  workspacePath: WorkspaceInfo["path"]
) {
  const stored = storage.get(workspaceEditorLayoutKey(workspacePath))
  if (stored) {
    const parsed = JSON.parse(stored)
    return Schema.decodeUnknownOption(EditorLayoutSchema)(parsed)
  }
  return Option.none()
}

export function readEditorLayout(
  storage: StorageService,
  workspacePath: WorkspaceInfo["path"]
): EditorLayout | null {
  const storageKey = workspaceEditorLayoutKey(workspacePath)
  const stored = storage.get(storageKey)

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

export function saveEditorLayout(
  storage: StorageService,
  layout: EditorLayout,
  workspacePath: WorkspaceInfo["path"]
): void {
  const storageKey = workspaceEditorLayoutKey(workspacePath)
  const encoded = Schema.encodeSync(EditorLayoutSchema)(layout)
  storage.set(storageKey, JSON.stringify(encoded))
}

export function openFile(
  storage: StorageService,
  filePath: AbsolutePath,
  workspacePath: WorkspaceInfo["path"]
): void {
  const currentLayout = readEditorLayout(storage, workspacePath)

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
    saveEditorLayout(storage, newLayout, workspacePath)
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
    saveEditorLayout(storage, updatedLayout, workspacePath)
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
      saveEditorLayout(storage, updatedLayout, workspacePath)
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
      saveEditorLayout(storage, newLayout, workspacePath)
    }
  }
}
