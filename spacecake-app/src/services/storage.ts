import { Option, Schema } from "effect"

import { EditorLayoutSchema, type EditorLayout } from "@/types/editor"
import { RecentFilesSchema, type RecentFile } from "@/types/storage"
import {
  AbsolutePath,
  WorkspaceInfo,
  WorkspaceInfoSchema,
  type FileType,
} from "@/types/workspace"

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

export function workspaceKey(): string {
  return "spacecake:workspace"
}

export function workspaceEditorLayoutKey(
  workspacePath: WorkspaceInfo["path"]
): string {
  return `spacecake:editor-layout:${workspaceId(workspacePath)}`
}

export function getWorkspace(
  storage: StorageService
): Option.Option<WorkspaceInfo> {
  const stored = storage.get(workspaceKey())
  if (stored) {
    const parsed = JSON.parse(stored)
    return Schema.decodeUnknownOption(WorkspaceInfoSchema)(parsed)
  }
  return Option.none()
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

export function getWorkspaceRecentFilesKey(workspacePath: string): string {
  return `spacecake:recent-files:${workspaceId(workspacePath)}`
}

export function readRecentFiles(
  storage: StorageService,
  workspacePath: string
): RecentFile[] {
  const storageKey = getWorkspaceRecentFilesKey(workspacePath)
  const stored = storage.get(storageKey)

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

export function updateRecentFiles(
  storage: StorageService,
  action:
    | {
        type: "add"
        file: { path: string; name: string; fileType: FileType }
        workspacePath: string
      }
    | { type: "remove"; filePath: string; workspacePath: string }
): void {
  const { workspacePath } = action
  const storageKey = getWorkspaceRecentFilesKey(workspacePath)

  // always read the latest from storage to prevent race conditions
  const currentFiles = readRecentFiles(storage, workspacePath)
  let updatedFiles: RecentFile[]

  switch (action.type) {
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
  storage.set(storageKey, JSON.stringify(encoded))
}

export function readEditorLayout(
  storage: StorageService,
  workspacePath: string
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
  workspacePath: string
): void {
  const storageKey = workspaceEditorLayoutKey(workspacePath)
  const encoded = Schema.encodeSync(EditorLayoutSchema)(layout)
  storage.set(storageKey, JSON.stringify(encoded))
}

export function openFile(
  storage: StorageService,
  filePath: AbsolutePath,
  workspacePath: string
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
