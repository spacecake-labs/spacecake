import { localStorageService } from "@/services/storage"

import type { ViewKind } from "@/types/lexical"
import { AbsolutePath, RelativePath } from "@/types/workspace"
import { supportsRichView } from "@/lib/language-support"
import { fileTypeFromExtension } from "@/lib/workspace"

/**
 * Determines the appropriate view for a file based on search params, stored preferences, and file type.
 * Also handles updating storage when a new view preference is provided.
 *
 * @param filePath - The file path to determine view for
 * @param viewFromSearch - Optional view from search params (user explicitly selected)
 * @returns The final view to use
 */
export function determineView(
  filePath: AbsolutePath | RelativePath,
  viewFromSearch?: ViewKind
): ViewKind {
  const fileType = fileTypeFromExtension(filePath.split(".").pop() || "")
  const defaultView = supportsRichView(fileType) ? "rich" : "source"

  // If view is explicitly provided in search params, use it and update storage
  if (viewFromSearch) {
    const storedPrefs = localStorageService.get("spacecake-view-preferences")
    const prefs = storedPrefs ? JSON.parse(storedPrefs) : {}

    // Always update storage with the explicit view choice (upsert behavior)
    prefs[fileType] = viewFromSearch
    localStorageService.set("spacecake-view-preferences", JSON.stringify(prefs))

    return viewFromSearch
  }

  // No explicit view provided, check stored preferences
  const storedPrefs = localStorageService.get("spacecake-view-preferences")
  const prefs = storedPrefs ? JSON.parse(storedPrefs) : {}
  const storedView = prefs[fileType]

  // Return stored preference or default based on file type
  return storedView || defaultView
}

/**
 * Gets the stored view preference for a file type without modifying storage.
 * Useful for read-only access to preferences.
 *
 * @param filePath - The file path to get preference for
 * @returns The stored view preference or null if none exists
 */
export function getStoredViewPreference(filePath: string): ViewKind | null {
  const fileType = fileTypeFromExtension(filePath.split(".").pop() || "")
  const storedPrefs = localStorageService.get("spacecake-view-preferences")
  const prefs = storedPrefs ? JSON.parse(storedPrefs) : {}
  return prefs[fileType] || null
}
