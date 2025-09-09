import { Option, Schema } from "effect"

import { WorkspaceInfo, WorkspaceInfoSchema } from "@/types/workspace"

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

export function workspaceFromStorage(
  storage: StorageService
): Option.Option<WorkspaceInfo> {
  const stored = storage.get("spacecake:workspace")
  if (stored) {
    const parsed = JSON.parse(stored)
    return Schema.decodeUnknownOption(WorkspaceInfoSchema)(parsed)
  }
  return Option.none()
}
