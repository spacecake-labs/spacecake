import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

import type { SearchResult } from "@/services/ripgrep-search"

// workspace search query + options (independent from in-file search)
export const workspaceSearchQueryAtom = atom<string>("")
export const workspaceSearchCaseSensitiveAtom = atomWithStorage<boolean>(
  "workspace-search-case-sensitive",
  false,
)
export const workspaceSearchWholeWordAtom = atomWithStorage<boolean>(
  "workspace-search-whole-word",
  false,
)
export const workspaceSearchRegexAtom = atomWithStorage<boolean>("workspace-search-regex", false)

// workspace search panel state
export const workspaceSearchOpenAtom = atom<boolean>(false)
export const workspaceSearchResultsAtom = atom<SearchResult[]>([])
export const workspaceSearchLoadingAtom = atom<boolean>(false)
export const workspaceSearchIncludeAtom = atom<string>("")
export const workspaceSearchExcludeAtom = atom<string>("")
export const workspaceSearchLimitHitAtom = atom<boolean>(false)
