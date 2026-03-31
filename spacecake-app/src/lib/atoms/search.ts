import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { AnyActorRef } from "xstate"

// in-file search state
export const searchQueryAtom = atom<string>("")
export const searchOpenAtom = atom<boolean>(false)

// search options (persisted across sessions)
export const searchCaseSensitiveAtom = atomWithStorage<boolean>("search-case-sensitive", false)
export const searchWholeWordAtom = atomWithStorage<boolean>("search-whole-word", false)
export const searchRegexAtom = atomWithStorage<boolean>("search-regex", false)

// one-shot atoms: set by workspace search to tell the in-file search plugin
// which line to jump to after opening a file from a search result.
// searchTargetFileAtom scopes the target line to a specific file so the old
// file's machine doesn't consume it before the new file's machine starts.
export const searchTargetLineAtom = atom<number | null>(null)
export const searchTargetFileAtom = atom<string | null>(null)

// set to the nodeKey of the newly-registered CM view; the search machine that
// owns that node re-runs its search so source-mode files don't get stuck at
// "no results" when the CM view registers after the first search attempt.
// only the machine whose editor contains the nodeKey reacts.
export const cmViewsChangedAtom = atom<string | null>(null)

// incremented each time cmd+f is pressed to refocus the search input
export const searchFocusTriggerAtom = atom<number>(0)

// actor ref for the search state machine, set by SearchPlugin.
// used by SearchBar (reads machine state) and workspace search (sends events).
export const searchActorAtom = atom<AnyActorRef | null>(null)
