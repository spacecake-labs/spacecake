import { atom } from "jotai"

import type { SearchResult } from "@/services/ripgrep-search"

// workspace search panel state
export const workspaceSearchOpenAtom = atom<boolean>(false)
export const workspaceSearchResultsAtom = atom<SearchResult[]>([])
export const workspaceSearchLoadingAtom = atom<boolean>(false)
export const workspaceSearchIncludeAtom = atom<string>("")
export const workspaceSearchExcludeAtom = atom<string>("")
export const workspaceSearchLimitHitAtom = atom<boolean>(false)
