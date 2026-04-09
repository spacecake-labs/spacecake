import { atom } from "jotai"
import type { Store } from "jotai/vanilla/store"

import { buildFileIndex, type WikiLinkFileIndex } from "@/lib/resolve-wikilink"
import type { IndexedFile } from "@/services/file-system"
import { match } from "@/types/adt"

/** flat file index for quick-open (decoupled from sidebar's file tree) */
export const quickOpenIndexAtom = atom<IndexedFile[]>([])

/** whether the background index has finished building */
export const quickOpenIndexReadyAtom = atom<boolean>(false)

/** whether a listFiles call is currently in flight (prevents duplicate IPC calls) */
export const quickOpenIndexLoadingAtom = atom<boolean>(false)

/**
 * derived index map for O(1) wikilink resolution.
 * rebuilds only when the flat file list changes.
 */
export const quickOpenIndexMapAtom = atom<WikiLinkFileIndex>((get) =>
  buildFileIndex(get(quickOpenIndexAtom)),
)

/**
 * ensure the file index is built. safe to call from multiple sites —
 * the loading atom prevents duplicate IPC calls.
 */
export function ensureFileIndex(store: Store, workspacePath: string): void {
  if (store.get(quickOpenIndexReadyAtom) || store.get(quickOpenIndexLoadingAtom)) return

  store.set(quickOpenIndexLoadingAtom, true)
  window.electronAPI.listFiles(workspacePath).then((result) => {
    match(result, {
      onLeft: (error) => {
        console.error("file index build failed:", error)
        store.set(quickOpenIndexLoadingAtom, false)
      },
      onRight: (files) => {
        store.set(quickOpenIndexAtom, files)
        store.set(quickOpenIndexReadyAtom, true)
        store.set(quickOpenIndexLoadingAtom, false)
      },
    })
  })
}
