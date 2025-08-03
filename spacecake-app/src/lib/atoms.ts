import { atom } from "jotai";
import type { FileEntry, WorkspaceInfo } from "@/types/workspace";
import type { SidebarNavItem } from "./workspace";
import { SerializedEditorState } from "lexical";

export const workspaceAtom = atom<WorkspaceInfo | null>(null);
export const filesAtom = atom<FileEntry[]>([]);
export const loadingAtom = atom<boolean>(false);

// Core workspace navigation state
export const workspaceItemsAtom = atom<SidebarNavItem[]>([]);

// Expanded folders state (keyed by folder url)
export const expandedFoldersAtom = atom<Record<string, boolean>>({});

// Loading folders state (array of folder urls currently loading)
export const loadingFoldersAtom = atom<string[]>([]);

// Editor state
export const editorStateAtom = atom<SerializedEditorState | null>(null);

// File content state
export const fileContentAtom = atom<{
  content: string;
  fileType: string;
} | null>(null);

// Selected file path
export const selectedFilePathAtom = atom<string | null>(null);

// Tree structure with folder contents
export const fileTreeAtom = atom<Record<string, SidebarNavItem[]>>({});

// Unified editing state for both create and rename operations
export const editingItemAtom = atom<{
  type: "create" | "rename";
  path: string;
  value: string;
  originalValue?: string; // for rename operations
} | null>(null);

// File creation and editing atoms
export const isCreatingFileAtom = atom<boolean>(false);
export const fileNameAtom = atom<string>("");
export const isRenamingFileAtom = atom<boolean>(false);
export const renameFileNameAtom = atom<string>("");
export const renamingItemAtom = atom<SidebarNavItem | null>(null);

// Context-aware creation atoms (for dropdown menu)
export const isCreatingInContextAtom = atom<{
  type: "file" | "folder";
  parentPath: string;
} | null>(null);
export const contextItemNameAtom = atom<string>("");
