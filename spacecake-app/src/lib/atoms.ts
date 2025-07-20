import { atom } from "jotai";
import type { FileEntry } from "@/types/electron";
import type { SidebarNavItem } from "./workspace";

export const workspaceAtom = atom<string | null>(null);
export const filesAtom = atom<FileEntry[]>([]);
export const loadingAtom = atom<boolean>(false);

// Atom for sidebar navigation data
export const sidebarNavAtom = atom<SidebarNavItem[]>([]);
