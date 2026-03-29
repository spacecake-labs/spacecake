import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// in-file search state
export const searchQueryAtom = atom<string>("")

// in-file search state
export const searchOpenAtom = atom<boolean>(false)
export const searchMatchIndexAtom = atom<number>(0)
export const searchMatchCountAtom = atom<number>(0)

// search options (persisted across sessions)
export const searchCaseSensitiveAtom = atomWithStorage<boolean>("search-case-sensitive", false)
export const searchWholeWordAtom = atomWithStorage<boolean>("search-whole-word", false)
export const searchRegexAtom = atomWithStorage<boolean>("search-regex", false)

// one-shot atom: set by workspace search to tell the in-file search plugin
// which line to jump to after opening a file from a search result
export const searchTargetLineAtom = atom<number | null>(null)
