import { atom } from "jotai"
import type { AnyActorRef } from "xstate"

// actor ref for the search state machine, set by SearchPlugin.
// the machine is the single source of truth for all search state.
// components read via useSelector and write via actor.send().
export const searchActorAtom = atom<AnyActorRef | null>(null)
