import { atom } from "jotai";
import type { FileEntry, WorkspaceInfo } from "@/types/electron";
import type { SidebarNavItem } from "./workspace";
import { SerializedEditorState } from "lexical";

export const workspaceAtom = atom<WorkspaceInfo | null>(null);
export const filesAtom = atom<FileEntry[]>([]);
export const loadingAtom = atom<boolean>(false);

// Atom for sidebar navigation data
export const sidebarNavAtom = atom<SidebarNavItem[]>([]);

// Atom for expanded folders in the sidebar (keyed by folder url)
export const expandedFoldersAtom = atom<Record<string, boolean>>({});
// Atom for loading folders (array of folder urls currently loading)
export const loadingFoldersAtom = atom<string[]>([]);

// Simplified editor state - just the serialized state
export const editorStateAtom = atom<SerializedEditorState | null>(null);

// Temporary file content for newly loaded files
export const fileContentAtom = atom<{
  content: string;
  fileType: string;
} | null>(null);

// Atom for the currently selected file path
export const selectedFilePathAtom = atom<string | null>(null);

// Atom for create file state
export const isCreatingFileAtom = atom<boolean>(false);
export const fileNameAtom = atom<string>("");
