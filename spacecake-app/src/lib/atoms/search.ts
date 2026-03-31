import { atom } from "jotai"
import type { AnyActorRef } from "xstate"

// actor ref for the search state machine, set by SearchPlugin.
// the machine is the single source of truth for all search state.
// components read via useSelector and write via actor.send().
export const searchActorAtom = atom<AnyActorRef | null>(null)

// ---------------------------------------------------------------------------
// pending search — module-level slot for workspace search handoff when the
// target file's search actor doesn't exist yet (file not open).
// workspace search writes here; SearchPlugin consumes on mount.
// ---------------------------------------------------------------------------

export interface PendingSearch {
  query: string
  targetLine: number | null
  targetFile: string | null
}

let pending: PendingSearch | null = null

export function setPendingSearch(p: PendingSearch): void {
  pending = p
}

export function consumePendingSearch(): PendingSearch | null {
  const p = pending
  pending = null
  return p
}
