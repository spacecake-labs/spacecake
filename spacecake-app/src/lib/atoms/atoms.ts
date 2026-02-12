import { atom, WritableAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { SerializedEditorState } from "lexical"

import type { DisplayStatusline } from "@/lib/statusline-parser"
import type { ExpandedFolders, File, FileTree, Folder } from "@/types/workspace"

import { AbsolutePath } from "@/types/workspace"

export function atomWithToggle(initialValue?: boolean): WritableAtom<boolean, [boolean?], void> {
  const anAtom = atom(initialValue, (get, set, nextValue?: boolean) => {
    const update = nextValue ?? !get(anAtom)
    set(anAtom, update)
  })

  return anAtom as WritableAtom<boolean, [boolean?], void>
}

export const quickOpenMenuOpenAtom = atomWithToggle(false)

// Save feedback state per file (shows tick/cross after save)
export const saveResultAtom = atom<"success" | "error" | null>(null)

export const fileTreeAtom = atom<FileTree>([])

export const expandedFoldersAtom = atom<ExpandedFolders>({})

// Atom for loading state of folders (when fetching children)
export const loadingFoldersAtom = atom<string[]>([])

// Editor state
export const editorStateAtom = atom<SerializedEditorState | null>(null)

// Unified editing state for both create and rename operations
export const editingItemAtom = atom<{
  type: "create" | "rename"
  path: string
  value: string
  originalValue?: string // for rename operations
} | null>(null)

// Context-aware creation atoms (for dropdown menu)
export const isCreatingInContextAtom = atom<{
  kind: "file" | "folder"
  parentPath: string
} | null>(null)
export const contextItemNameAtom = atom<string>("")

// track which files have been opened (have state machines)
export const openedFilesAtom = atom<Set<AbsolutePath>>(new Set<AbsolutePath>())

// Deletion state atoms
export const deletionStateAtom = atom<{
  item: File | Folder | null
  isOpen: boolean
  isDeleting: boolean
}>({
  item: null,
  isOpen: false,
  isDeleting: false,
})

// Revert state atoms
export type RevertState =
  | { isOpen: false }
  | {
      isOpen: true
      filePath: AbsolutePath
      fileName: string
      isReverting: boolean
    }

export const revertStateAtom = atom<RevertState>({ isOpen: false })

export type Theme = "light" | "dark" | "system"

// theme state (persisted)
export const themeAtom = atomWithStorage<Theme>("spacecake-theme", "system")

// terminal shell profile loaded (initialized when bracketed paste mode is enabled)
export const terminalProfileLoadedAtom = atom<boolean>(false)

// Claude statusline data (model, context usage, cost)
export const claudeStatuslineAtom = atom<DisplayStatusline | null>(null)

// Persisted flag so the "IDE disconnected" toast is only shown once
export const ideDisconnectedToastShownAtom = atomWithStorage<boolean>(
  "spacecake-ide-disconnected-toast-shown",
  false,
)

// persisted dismiss flag for watchman recommendation badge
export const watchmanBadgeDismissedAtom = atomWithStorage<boolean>(
  "spacecake-watchman-badge-dismissed",
  false,
)
