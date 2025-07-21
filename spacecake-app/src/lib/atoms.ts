import { atom } from "jotai";
import type { FileEntry, WorkspaceInfo } from "@/types/electron";
import type { SidebarNavItem } from "./workspace";

export const workspaceAtom = atom<string | null>(null);
export const workspaceInfoAtom = atom<WorkspaceInfo | null>(null);
export const filesAtom = atom<FileEntry[]>([]);
export const loadingAtom = atom<boolean>(false);

// Atom for sidebar navigation data
export const sidebarNavAtom = atom<SidebarNavItem[]>([]);

// Atom for expanded folders in the sidebar (keyed by folder url)
export const expandedFoldersAtom = atom<Record<string, boolean>>({});
// Atom for loading folders (array of folder urls currently loading)
export const loadingFoldersAtom = atom<string[]>([]);
