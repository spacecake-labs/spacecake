import { atom } from "jotai"

import type { IndexedFile } from "@/services/file-system"

/** flat file index for quick-open (decoupled from sidebar's file tree) */
export const quickOpenIndexAtom = atom<IndexedFile[]>([])

/** whether the background index has finished building */
export const quickOpenIndexReadyAtom = atom<boolean>(false)
