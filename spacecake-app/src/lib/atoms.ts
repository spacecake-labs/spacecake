import { atom } from "jotai";
import type { FileEntry } from "@/types/electron";

export const workspaceAtom = atom<string | null>(null);
export const filesAtom = atom<FileEntry[]>([]);
export const loadingAtom = atom<boolean>(false);
